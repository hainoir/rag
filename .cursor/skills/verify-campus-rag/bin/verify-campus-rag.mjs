#!/usr/bin/env node
// Harness for the campus RAG verification skill. Agents should follow SKILL.md.

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const require = createRequire(path.join(repoRoot, "package.json"));
const scratchDir = path.join(repoRoot, "artifacts/verify-campus-rag/scratch");
const evidenceDir = path.join(repoRoot, "artifacts/verify-campus-rag/evidence");
const runFile = path.join(scratchDir, "run.json");
const harnessLog = path.join(evidenceDir, "harness.log");
const PRODUCT_NAME = "校园信息检索与可解释问答助手";
const READY_QUERY = "图书馆借书";
const READY_SOURCE = "图书馆借阅与续借办理说明";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  }

  return { positional, flags };
}

function readRun() {
  try {
    return JSON.parse(fs.readFileSync(runFile, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function writeRun(run) {
  fs.mkdirSync(scratchDir, { recursive: true });
  fs.writeFileSync(runFile, `${JSON.stringify(run, null, 2)}\n`);
}

function record(line) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.appendFileSync(harnessLog, `${new Date().toISOString()} ${line}\n`);
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function cmdline(pid) {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim();
  } catch {
    return "";
  }
}

function procCwd(pid) {
  try {
    return fs.realpathSync(fs.readlinkSync(`/proc/${pid}/cwd`));
  } catch {
    return "";
  }
}

function isAncestor(ancestorPid, pid) {
  let current = Number(pid);
  const seen = new Set();

  while (current > 1 && !seen.has(current)) {
    if (current === Number(ancestorPid)) {
      return true;
    }

    seen.add(current);

    let status;

    try {
      status = fs.readFileSync(`/proc/${current}/status`, "utf8");
    } catch {
      return false;
    }

    const match = status.match(/^PPid:\s+(\d+)/m);

    if (!match) {
      return false;
    }

    current = Number(match[1]);
  }

  return false;
}

function assertOwnedProcess(pid, label, pattern) {
  if (!isAlive(pid)) {
    return false;
  }

  const line = cmdline(pid);
  const cwd = procCwd(pid);

  if (cwd !== repoRoot) {
    throw new Error(`Refusing to signal ${label} pid ${pid}; cwd is ${cwd || "unknown"}.`);
  }

  if (!pattern.test(line)) {
    throw new Error(`Refusing to signal ${label} pid ${pid}; cmdline is ${JSON.stringify(line)}.`);
  }

  return true;
}

function killGroup(pid, signal) {
  try {
    process.kill(-Number(pid), signal);
    return true;
  } catch (error) {
    if (error && error.code === "ESRCH") {
      return false;
    }

    try {
      process.kill(Number(pid), signal);
      return true;
    } catch (inner) {
      if (inner && inner.code === "ESRCH") {
        return false;
      }

      throw inner;
    }
  }
}

async function waitDead(pid, timeoutMs) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (!isAlive(pid)) {
      return true;
    }

    await sleep(200);
  }

  return !isAlive(pid);
}

function tail(filePath, lines = 40) {
  try {
    return fs.readFileSync(filePath, "utf8").split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function listeningPids(port) {
  let output;

  try {
    output = execFileSync("ss", ["-H", "-ltnp"], { encoding: "utf8" });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return listeningPidsFromProc(port);
    }

    throw error;
  }

  const needle = new RegExp(`:${port}(?:\\s|$)`);
  const pids = new Set();

  for (const line of output.split("\n")) {
    if (!needle.test(line)) {
      continue;
    }

    for (const match of line.matchAll(/pid=(\d+)/g)) {
      pids.add(Number(match[1]));
    }
  }

  return [...pids];
}

function listeningPidsFromProc(port) {
  const inodes = new Set();

  for (const filePath of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let content;

    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    for (const line of content.split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);

      if (parts.length < 10 || parts[3] !== "0A") {
        continue;
      }

      const local = parts[1];
      const portHex = local.slice(local.lastIndexOf(":") + 1);

      if (Number.parseInt(portHex, 16) !== port) {
        continue;
      }

      inodes.add(parts[9]);
    }
  }

  if (inodes.size === 0) {
    return [];
  }

  const pids = new Set();

  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) {
      continue;
    }

    const fdDir = path.join("/proc", entry, "fd");
    let fds;

    try {
      fds = fs.readdirSync(fdDir);
    } catch {
      continue;
    }

    for (const fd of fds) {
      try {
        const target = fs.readlinkSync(path.join(fdDir, fd));
        const match = target.match(/^socket:\[(\d+)\]$/);

        if (match && inodes.has(match[1])) {
          pids.add(Number(entry));
        }
      } catch {
        // A file descriptor can vanish while we scan.
      }
    }
  }

  return [...pids];
}

function assertPortOwned(port, ancestorPid, label) {
  const pids = listeningPids(port);

  if (pids.length === 0) {
    throw new Error(`${label} port ${port} is not listening.`);
  }

  for (const pid of pids) {
    if (!isAncestor(ancestorPid, pid)) {
      const owner = cmdline(pid) || "unknown";
      throw new Error(`${label} port ${port} is owned by pid ${pid} (${owner}), not verification pid ${ancestorPid}.`);
    }
  }

  return pids;
}

function reservePort(preferred) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(preferred, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : preferred;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function choosePort(envName, start) {
  const requested = process.env[envName];

  if (requested) {
    const port = Number(requested);

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`${envName} must be a positive integer.`);
    }

    try {
      await reservePort(port);
    } catch (error) {
      if (error && error.code === "EADDRINUSE") {
        throw new Error(`${envName}=${port} is already in use. Refusing to share it.`, { cause: error });
      }

      throw error;
    }

    return port;
  }

  for (let port = start; port < start + 30; port += 1) {
    try {
      return await reservePort(port);
    } catch (error) {
      if (error && error.code === "EADDRINUSE") {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`No free TCP port from ${start} to ${start + 29}.`);
}

function gitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
}

function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
}

function readNextLock() {
  const lockPath = path.join(repoRoot, ".next/dev/lock");

  let content;

  try {
    content = fs.readFileSync(lockPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  try {
    return { lockPath, ...JSON.parse(content) };
  } catch {
    return { lockPath, unreadable: true };
  }
}

function childEnv(overrides) {
  return {
    ...process.env,
    DATABASE_URL: "",
    REDIS_URL: "",
    SEARCH_SERVICE_API_KEY: "",
    SEARCH_SERVICE_DISABLE_ENV_FILE: "1",
    SEARCH_ANSWER_MODE: "extractive",
    SEARCH_SERVICE_PROVIDER: "seed",
    SEARCH_RETRIEVAL_MODE: "auto",
    SEARCH_RERANK_MODE: "off",
    LLM_API_KEY: "",
    EMBEDDING_API_KEY: "",
    RERANK_API_KEY: "",
    ADMIN_DASHBOARD_TOKEN: "",
    NEXT_TELEMETRY_DISABLED: "1",
    ...overrides,
  };
}

function spawnLogged(command, args, env, logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);

  if (!child.pid) {
    throw new Error(`Failed to spawn ${command} ${args.join(" ")}.`);
  }

  return child.pid;
}

async function waitFor(check, timeoutMs, label) {
  const started = Date.now();
  let lastError = "not ready";

  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();

      if (value) {
        return value;
      }

      lastError = "check returned false";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(400);
  }

  throw new Error(`${label} was not ready after ${timeoutMs}ms: ${lastError}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, ok: response.ok, body };
}

async function assertSearchHealth(port) {
  const health = await fetchJson(`http://127.0.0.1:${port}/health`);

  if (!health.ok || !health.body || typeof health.body !== "object") {
    throw new Error(`health HTTP ${health.status}`);
  }

  if (health.body.status !== "ok") {
    throw new Error(`health status ${health.body.status}`);
  }

  if (health.body.provider !== "seed") {
    throw new Error(`health provider ${health.body.provider}`);
  }

  if (health.body.databaseRequired !== false) {
    throw new Error(`health databaseRequired ${health.body.databaseRequired}`);
  }

  if (health.body.mode?.answerMode !== "extractive") {
    throw new Error(`health answerMode ${health.body.mode?.answerMode}`);
  }

  if (!(Number(health.body.corpusSize) > 0)) {
    throw new Error(`health corpusSize ${health.body.corpusSize}`);
  }

  return health.body;
}

async function assertHomepage(webUrl) {
  const response = await fetch(`${webUrl}/`);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`homepage HTTP ${response.status}`);
  }

  if (!text.includes(PRODUCT_NAME)) {
    throw new Error("homepage does not include the product name");
  }

  return true;
}

async function assertReadySearch(webUrl) {
  const result = await fetchJson(`${webUrl}/api/search?q=${encodeURIComponent(READY_QUERY)}`);

  if (!result.ok || !result.body || typeof result.body !== "object") {
    throw new Error(`api/search HTTP ${result.status}`);
  }

  if (result.body.status !== "ok" || !result.body.answer) {
    throw new Error(`api/search status ${result.body.status}`);
  }

  const titles = Array.isArray(result.body.sources) ? result.body.sources.map((source) => source.title) : [];

  if (!titles.includes(READY_SOURCE)) {
    throw new Error(`api/search sources ${titles.join(", ") || "(none)"}`);
  }

  return result.body;
}

function foreignNextLock() {
  const lock = readNextLock();

  if (!lock?.pid || !isAlive(lock.pid)) {
    return null;
  }

  return lock;
}

async function launch() {
  if (!fs.existsSync("/proc/self")) {
    throw new Error("This harness drives the app with Linux /proc and POSIX process groups.");
  }

  const existing = readRun();

  if (existing) {
    throw new Error(
      "A verification run.json already exists. Run cleanup before launching another instance. Refusing to share or replace it.",
    );
  }

  const foreign = foreignNextLock();

  if (foreign) {
    throw new Error(
      `Another next dev already holds ${foreign.lockPath} (pid ${foreign.pid}, ${foreign.appUrl || "url unknown"}). Refusing to drive a shared Next instance.`,
    );
  }

  const searchPort = await choosePort("VERIFY_CAMPUS_RAG_SEARCH_PORT", 8180);
  const webPort = await choosePort("VERIFY_CAMPUS_RAG_WEB_PORT", 3100);
  const webUrl = `http://localhost:${webPort}`;
  const run = {
    runId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    repoRoot,
    gitSha: gitSha(),
    packageVersion: packageVersion(),
    webPort,
    searchPort,
    webUrl,
    searchPid: null,
    webPid: null,
    browserPid: null,
    browserPort: null,
    searchLog: path.join(scratchDir, "search.log"),
    webLog: path.join(scratchDir, "web.log"),
    browserLog: path.join(scratchDir, "browser.log"),
    corpusSize: null,
    nextLockPid: null,
    startedAt: new Date().toISOString(),
  };

  fs.mkdirSync(scratchDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });

  try {
    run.searchPid = spawnLogged(
      "npm",
      ["run", "search-service"],
      childEnv({
        PORT: String(searchPort),
        HOST: "127.0.0.1",
      }),
      run.searchLog,
    );
    writeRun(run);
    const health = await waitFor(() => assertSearchHealth(searchPort), 30_000, "search-service");
    run.corpusSize = health.corpusSize;
    writeRun(run);

    run.webPid = spawnLogged(
      "npm",
      ["run", "dev"],
      childEnv({
        PORT: String(webPort),
        SEARCH_SERVICE_URL: `http://127.0.0.1:${searchPort}/api/search`,
        SEARCH_SERVICE_METHOD: "POST",
        SEARCH_SERVICE_LIMIT: "6",
        SEARCH_SERVICE_TIMEOUT_MS: "8000",
      }),
      run.webLog,
    );
    writeRun(run);
    await waitFor(() => assertHomepage(webUrl), 120_000, "next dev homepage");
    await waitFor(() => assertReadySearch(webUrl), 60_000, "next /api/search");

    const lock = await waitFor(async () => {
      const current = readNextLock();

      if (!current?.pid || Number(current.port) !== run.webPort || !isAncestor(run.webPid, current.pid)) {
        return false;
      }

      return current;
    }, 15_000, "next dev lock");

    run.nextLockPid = lock.pid;
    writeRun(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(`launch failed: ${message}`);
    console.error(message);
    console.error("--- search log ---");
    console.error(tail(run.searchLog));
    console.error("--- web log ---");
    console.error(tail(run.webLog));
    await cleanupOwned(run);
    process.exit(1);
  }

  record(`launch runId=${run.runId} web=${run.webUrl} searchPort=${run.searchPort} sha=${run.gitSha}`);
  console.log(`launched verify-campus-rag`);
  console.log(`runId: ${run.runId}`);
  console.log(`webUrl: ${run.webUrl}`);
  console.log(`searchHealth: http://127.0.0.1:${run.searchPort}/health`);
  console.log(`gitSha: ${run.gitSha}`);
  console.log(`packageVersion: ${run.packageVersion}`);
  console.log(`corpusSize: ${run.corpusSize}`);
  console.log(`searchPid: ${run.searchPid}`);
  console.log(`webPid: ${run.webPid}`);
  console.log(`nextLockPid: ${run.nextLockPid}`);
}

function requireRun() {
  const run = readRun();

  if (!run) {
    throw new Error("No verification instance is recorded. Run launch first. Refusing to drive an unrelated server.");
  }

  return run;
}

async function doctor() {
  const run = requireRun();
  const checks = [];

  async function check(name, fn) {
    try {
      const detail = await fn();
      checks.push({ name, ok: true, detail: detail || "ok" });
    } catch (error) {
      checks.push({
        name,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await check("version", async () => {
    const sha = gitSha();
    const version = packageVersion();

    if (sha !== run.gitSha) {
      throw new Error(`running instance launched at ${run.gitSha}, checkout is ${sha}`);
    }

    if (version !== run.packageVersion) {
      throw new Error(`running instance launched at package ${run.packageVersion}, checkout is ${version}`);
    }

    return `${version} ${sha}`;
  });

  await check("search-process", async () => {
    if (!assertOwnedProcess(run.searchPid, "search-service", /search-service|server\.cjs/)) {
      throw new Error(`search pid ${run.searchPid} is not running`);
    }

    return cmdline(run.searchPid);
  });

  await check("web-process", async () => {
    if (!assertOwnedProcess(run.webPid, "next dev", /npm run dev|next/)) {
      throw new Error(`web pid ${run.webPid} is not running`);
    }

    return cmdline(run.webPid);
  });

  await check("search-port", async () => {
    const pids = assertPortOwned(run.searchPort, run.searchPid, "search-service");
    return pids.join(",");
  });

  await check("web-port", async () => {
    const pids = assertPortOwned(run.webPort, run.webPid, "next dev");
    return pids.join(",");
  });

  await check("search-health", async () => {
    const health = await assertSearchHealth(run.searchPort);

    if (health.corpusSize !== run.corpusSize) {
      throw new Error(`corpusSize is ${health.corpusSize}, launch recorded ${run.corpusSize}`);
    }

    return `status=ok provider=seed databaseRequired=false answerMode=extractive corpusSize=${health.corpusSize}`;
  });

  await check("homepage", async () => {
    await assertHomepage(run.webUrl);
    return run.webUrl;
  });

  await check("search-api", async () => {
    await assertReadySearch(run.webUrl);
    return `${READY_QUERY} -> ${READY_SOURCE}`;
  });

  await check("next-lock", async () => {
    const lock = readNextLock();

    if (!lock?.pid) {
      throw new Error("missing .next/dev/lock");
    }

    if (lock.pid !== run.nextLockPid || Number(lock.port) !== run.webPort) {
      throw new Error(
        `lock pid ${lock.pid} port ${lock.port}, launch recorded pid ${run.nextLockPid} port ${run.webPort}`,
      );
    }

    if (!isAncestor(run.webPid, lock.pid)) {
      throw new Error(`lock pid ${lock.pid} is not a descendant of web pid ${run.webPid}`);
    }

    return `pid ${lock.pid} port ${lock.port} ${lock.appUrl || ""}`.trim();
  });

  let failed = false;

  for (const item of checks) {
    const line = `${item.ok ? "pass" : "fail"} ${item.name} ${item.detail}`;
    console.log(line);
    record(`doctor ${line}`);

    if (!item.ok) {
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }
}

async function stopPid(pid, label, pattern) {
  if (!pid) {
    return "absent";
  }

  const owned = assertOwnedProcess(pid, label, pattern);

  if (!owned) {
    return "already-exited";
  }

  killGroup(pid, "SIGTERM");
  const stopped = await waitDead(pid, 5_000);

  if (!stopped && isAlive(pid)) {
    assertOwnedProcess(pid, label, pattern);
    killGroup(pid, "SIGKILL");
    await waitDead(pid, 2_000);
  }

  if (isAlive(pid)) {
    throw new Error(`${label} pid ${pid} is still running.`);
  }

  return "stopped";
}

async function cleanupOwned(run) {
  const results = [];

  if (run) {
    results.push(`browser ${await stopPid(run.browserPid, "browser session", /verify-campus-rag\.mjs/)}`);
    results.push(`web ${await stopPid(run.webPid, "next dev", /npm run dev|next/)}`);
    results.push(`search ${await stopPid(run.searchPid, "search-service", /search-service|server\.cjs/)}`);
  }

  fs.rmSync(scratchDir, { recursive: true, force: true });
  return results;
}

function listEvidence() {
  if (!fs.existsSync(evidenceDir)) {
    return [];
  }

  const files = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(path.relative(repoRoot, fullPath));
      }
    }
  }

  walk(evidenceDir);
  return files.sort();
}

async function cleanup() {
  const run = readRun();

  try {
    const results = await cleanupOwned(run);
    record(`cleanup ${results.join("; ") || "no instance"}`);
    console.log(results.length ? `stopped ${results.join(", ")}` : "no verification instance recorded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(`cleanup failed: ${message}`);
    console.error(message);
    process.exit(1);
  }

  const evidence = listEvidence();
  console.log(`kept evidence under artifacts/verify-campus-rag/evidence (${evidence.length} file(s))`);

  for (const filePath of evidence) {
    console.log(`kept ${filePath}`);
  }
}

function evidencePath(relativePath) {
  if (!relativePath || relativePath === true) {
    throw new Error("A --path under artifacts/verify-campus-rag/evidence is required.");
  }

  const absolute = path.resolve(repoRoot, relativePath);
  const relative = path.relative(evidenceDir, absolute);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside artifacts/verify-campus-rag/evidence: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return absolute;
}

function metaFor(flags, extra) {
  return [
    `feature: ${flags.feature}`,
    `entry: ${flags.entry}`,
    ...extra,
    `capturedAt: ${new Date().toISOString()}`,
  ].join("\n");
}

function requireProofFlags(flags) {
  if (typeof flags.feature !== "string" || typeof flags.entry !== "string") {
    throw new Error("Proof commands require --feature and --entry.");
  }
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot load playwright. From the repo root run \`npm install\`. ${message}`, { cause: error });
  }
}

async function ensureBrowser(run) {
  if (run.browserPort) {
    try {
      const health = await fetchJson(`http://127.0.0.1:${run.browserPort}/health`);

      if (health.ok && health.body?.ok === true && isAlive(run.browserPid)) {
        return run;
      }
    } catch {
      // The recorded session is gone; start another one only if its pid is dead.
    }

    if (isAlive(run.browserPid)) {
      throw new Error(
        `Browser session pid ${run.browserPid} is running but its health check failed. Run cleanup instead of starting a second browser.`,
      );
    }
  }

  const browserPort = await choosePort("VERIFY_CAMPUS_RAG_BROWSER_PORT", 9330);
  run.browserPort = browserPort;
  run.browserPid = spawnLogged(
    process.execPath,
    [fileURLToPath(import.meta.url), "session"],
    {
      ...process.env,
      VERIFY_BROWSER_PORT: String(browserPort),
      VERIFY_RUN_FILE: runFile,
    },
    run.browserLog,
  );
  writeRun(run);

  try {
    await waitFor(async () => {
      const health = await fetchJson(`http://127.0.0.1:${browserPort}/health`);
      return health.ok && health.body?.ok === true;
    }, 30_000, "browser session");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\n${tail(run.browserLog)}\nIf Chromium is missing, run \`npx playwright install chromium\` from the repo root.`,
      { cause: error },
    );
  }

  return readRun();
}

async function browserCommand(payload) {
  const run = await ensureBrowser(requireRun());
  const response = await fetch(`http://127.0.0.1:${run.browserPort}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `browser command failed with HTTP ${response.status}`);
  }

  return body;
}

function locatorFor(page, flags) {
  let locator;

  if (flags.selector) {
    if (flags.selector !== "html") {
      throw new Error("The only accepted --selector is html, used for the document data-theme attribute.");
    }

    locator = page.locator("html");
  } else if (flags.testid) {
    locator = page.getByTestId(flags.testid);
  } else if (flags.label) {
    locator = page.getByLabel(flags.label, { exact: Boolean(flags.exact) });
  } else if (flags.role) {
    const options = {};

    if (flags.name) {
      options.name = flags.name;
      options.exact = Boolean(flags.exact);
    }

    locator = page.getByRole(flags.role, options);
  } else if (flags.text) {
    locator = page.getByText(flags.text, { exact: Boolean(flags.exact) });
  } else {
    throw new Error("A target flag is required: --role, --label, --testid, --text, or --selector html.");
  }

  if (flags.first) {
    locator = locator.first();
  }

  return locator;
}

async function assertSingleTarget(locator, flags) {
  if (flags.first) {
    return;
  }

  const count = await locator.count();

  if (count !== 1) {
    throw new Error(`Expected one match and found ${count}. Pass --first only when the recipe names a repeated control.`);
  }
}

function resolveGoto(webUrl, rawPath) {
  if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
    const url = new URL(rawPath);
    const base = new URL(webUrl);

    if (url.origin !== base.origin) {
      throw new Error(`Refusing to open ${url.origin}. Verification stays on ${base.origin}.`);
    }

    return url.href;
  }

  const pathname = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return new URL(pathname, webUrl).href;
}

async function waitForHydration(page) {
  await page.locator("main").first().waitFor({ state: "visible", timeout: 15_000 });
  await waitFor(async () => {
    const theme = await page.locator("html").getAttribute("data-theme");
    return theme === "light" || theme === "dark" ? theme : false;
  }, 15_000, "page hydration");
}

async function handleBrowser(page, context, flags, positional, webUrl) {
  const action = positional[0];

  if (action === "reset") {
    await context.close();
    return { reset: true, replaceContext: true };
  }

  if (action === "goto") {
    const target = positional[1];

    if (!target) {
      throw new Error("browser goto requires a path.");
    }

    const url = resolveGoto(webUrl, target);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForHydration(page);
    return { url: page.url(), title: await page.title() };
  }

  if (action === "reload") {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForHydration(page);
    return { url: page.url(), title: await page.title() };
  }

  if (action === "fill") {
    const locator = locatorFor(page, flags);
    await assertSingleTarget(locator, flags);
    await locator.fill(String(flags.value ?? ""), { timeout: 15_000 });
    return { url: page.url(), value: flags.value };
  }

  if (action === "click") {
    const locator = locatorFor(page, flags);
    await assertSingleTarget(locator, flags);
    await locator.click({ timeout: 15_000 });
    return { url: page.url(), title: await page.title() };
  }

  if (action === "expect") {
    return expectPage(page, positional[1], flags);
  }

  if (action === "storage") {
    requireProofFlags(flags);
    const key = flags.key;

    if (typeof key !== "string") {
      throw new Error("browser storage requires --key.");
    }

    const value = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);

    if (typeof flags.contains === "string" && !String(value ?? "").includes(flags.contains)) {
      throw new Error(`localStorage ${key} is ${JSON.stringify(value)}, which does not contain ${JSON.stringify(flags.contains)}.`);
    }

    if (flags.path) {
      const filePath = evidencePath(flags.path);
      fs.writeFileSync(
        filePath,
        `${metaFor(flags, [`key: ${key}`, `value: ${value ?? ""}`])}\n`,
      );
    }

    return { key, value, url: page.url(), title: await page.title() };
  }

  if (action === "snapshot") {
    requireProofFlags(flags);

    if (flags.aria !== true) {
      throw new Error("browser snapshot requires --aria.");
    }

    const filePath = evidencePath(flags.path);
    const snapshot = await page.locator("body").ariaSnapshot({ timeout: 15_000 });
    const title = await page.title();

    if (!title.includes("校园信息检索") && !snapshot.includes("校园信息检索")) {
      throw new Error(`Snapshot does not identify the product. title=${JSON.stringify(title)}`);
    }

    fs.writeFileSync(
      filePath,
      `${metaFor(flags, [`url: ${page.url()}`, `title: ${title}`])}\n---\n${snapshot}\n`,
    );
    return { path: flags.path, url: page.url(), title };
  }

  if (action === "screenshot") {
    requireProofFlags(flags);
    const filePath = evidencePath(flags.path);

    if (!filePath.endsWith(".png")) {
      throw new Error("Screenshot --path must end in .png.");
    }

    const title = await waitFor(async () => {
      const current = await page.title();
      return current.includes("校园信息检索") ? current : false;
    }, 15_000, "document title");
    await page.screenshot({ path: filePath, fullPage: true, timeout: 30_000 });
    const metaPath = filePath.replace(/\.png$/, ".meta.txt");
    fs.writeFileSync(metaPath, `${metaFor(flags, [`url: ${page.url()}`, `title: ${title}`, `image: ${flags.path}`])}\n`);

    return { path: flags.path, url: page.url(), title };
  }

  throw new Error(`Unknown browser action ${action || "(missing)"}.`);
}

async function expectPage(page, kind, flags) {
  const timeout = 15_000;

  if (kind === "url") {
    if (typeof flags.includes !== "string") {
      throw new Error("browser expect url requires --includes.");
    }

    await waitFor(async () => (page.url().includes(flags.includes) ? page.url() : false), timeout, "url");
    return { url: page.url(), title: await page.title() };
  }

  if (kind === "absent") {
    const locator = locatorFor(page, flags);
    const count = await locator.count();

    if (count !== 0) {
      throw new Error(`Expected no match and found ${count}.`);
    }

    return { count, url: page.url(), title: await page.title() };
  }

  if (kind === "count") {
    const min = flags.min === undefined ? undefined : Number(flags.min);
    const max = flags.max === undefined ? undefined : Number(flags.max);
    const locator = locatorFor(page, flags);
    const matched = await waitFor(
      async () => {
        const value = await locator.count();
        const aboveMin = min === undefined || value >= min;
        const belowMax = max === undefined || value <= max;
        return aboveMin && belowMax ? { count: value } : false;
      },
      timeout,
      "count",
    );
    return { count: matched.count, url: page.url(), title: await page.title() };
  }

  if (kind === "enabled" || kind === "disabled") {
    const locator = locatorFor(page, flags);
    await assertSingleTarget(locator, flags);
    await waitFor(async () => {
      const enabled = await locator.isEnabled();
      return (kind === "enabled" ? enabled : !enabled) ? true : false;
    }, timeout, kind);
    return { url: page.url(), title: await page.title() };
  }

  if (kind === "attribute") {
    if (typeof flags.attr !== "string" || typeof flags.value !== "string") {
      throw new Error("browser expect attribute requires --attr and --value.");
    }

    const locator = locatorFor(page, flags);
    await assertSingleTarget(locator, flags);
    await waitFor(async () => ((await locator.getAttribute(flags.attr)) === flags.value ? true : false), timeout, "attribute");
    return { attr: flags.attr, value: flags.value, url: page.url(), title: await page.title() };
  }

  if (kind === "heading" || kind === "text") {
    if (typeof flags.name !== "string") {
      throw new Error(`browser expect ${kind} requires --name.`);
    }

    const locator =
      kind === "heading"
        ? page.getByRole("heading", { name: flags.name, exact: Boolean(flags.exact) }).first()
        : page.getByText(flags.name, { exact: Boolean(flags.exact) }).first();

    await locator.waitFor({ state: "visible", timeout });
    return { url: page.url(), title: await page.title() };
  }

  throw new Error(`Unknown expect kind ${kind || "(missing)"}.`);
}

async function sessionMain() {
  const port = Number(process.env.VERIFY_BROWSER_PORT);
  const sessionRunFile = process.env.VERIFY_RUN_FILE;

  if (!port || !sessionRunFile) {
    throw new Error("session requires VERIFY_BROWSER_PORT and VERIFY_RUN_FILE.");
  }

  const run = JSON.parse(fs.readFileSync(sessionRunFile, "utf8"));
  const { chromium } = loadPlaywright();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not launch Chromium. Run \`npx playwright install chromium\` from the repo root. ${message}`,
      { cause: error },
    );
  }

  let context = await browser.newContext({
    colorScheme: "light",
    locale: "zh-CN",
    viewport: { width: 1440, height: 900 },
  });
  let page = await context.newPage();
  page.setDefaultTimeout(15_000);
  let chain = Promise.resolve();

  const server = http.createServer((request, response) => {
    const send = (status, payload) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(payload));
    };

    if (request.method === "GET" && request.url === "/health") {
      send(200, { ok: true, url: page.url() });
      return;
    }

    if (request.method !== "POST" || request.url !== "/command") {
      send(404, { ok: false, error: "not found" });
      return;
    }

    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", (error) => send(500, { ok: false, error: error.message }));
    request.on("end", () => {
      chain = chain.then(async () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        const result = await handleBrowser(page, context, payload.flags || {}, payload.positional || [], run.webUrl);

        if (result?.replaceContext) {
          context = await browser.newContext({
            colorScheme: "light",
            locale: "zh-CN",
            viewport: { width: 1440, height: 900 },
          });
          page = await context.newPage();
          page.setDefaultTimeout(15_000);
        }

        send(200, { ok: true, ...result, replaceContext: undefined });
      }).catch((error) => {
        send(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    });
  });

  await new Promise((resolve) => {
    server.listen(port, "127.0.0.1", resolve);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close(() => {
        browser.close().finally(() => process.exit(0));
      });
    });
  }
}

async function apiSearch(flags) {
  requireProofFlags(flags);
  const run = requireRun();
  const query = flags.query;

  if (typeof query !== "string" || !query.trim()) {
    throw new Error("api search requires --query.");
  }

  const result = await fetchJson(`${run.webUrl}/api/search?q=${encodeURIComponent(query)}`);

  if (!result.ok || !result.body || typeof result.body !== "object") {
    throw new Error(`/api/search returned HTTP ${result.status}.`);
  }

  const expected = typeof flags["expect-status"] === "string" ? flags["expect-status"].split(",") : null;

  if (expected && !expected.includes(result.body.status)) {
    throw new Error(`status ${result.body.status}, expected ${expected.join(" or ")}.`);
  }

  if (flags["require-answer"]) {
    if (!result.body.answer?.summary || !result.body.answer.evidence?.length) {
      throw new Error("expected an answer summary and evidence.");
    }
  }

  if (flags["forbid-answer"] && result.body.answer !== null) {
    throw new Error("expected answer to be null.");
  }

  if (typeof flags["source-title"] === "string") {
    const titles = (result.body.sources || []).map((source) => source.title);

    if (!titles.includes(flags["source-title"])) {
      throw new Error(`sources were ${titles.join(", ") || "(none)"}.`);
    }
  }

  if (flags.path) {
    const filePath = evidencePath(flags.path);
    fs.writeFileSync(filePath, `${JSON.stringify(result.body, null, 2)}\n`);
    fs.writeFileSync(
      filePath.replace(/\.json$/, ".meta.txt"),
      `${metaFor(flags, [
        `url: ${run.webUrl}/api/search?q=${encodeURIComponent(query)}`,
        `httpStatus: ${result.status}`,
        `searchStatus: ${result.body.status}`,
      ])}\n`,
    );
  }

  const titles = (result.body.sources || []).map((source) => `${source.type}:${source.title}`).join(" | ");
  return `status=${result.body.status} sources=${result.body.sources?.length ?? 0} ${titles}`;
}

function printUsage() {
  console.log(`Usage:
  node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs launch
  node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs doctor
  node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs browser <action> [flags]
  node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs api search [flags]
  node .cursor/skills/verify-campus-rag/bin/verify-campus-rag.mjs cleanup`);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || flags.help) {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command === "session") {
    await sessionMain();
    return;
  }

  if (command === "launch") {
    await launch();
    return;
  }

  if (command === "doctor") {
    await doctor();
    return;
  }

  if (command === "cleanup") {
    await cleanup();
    return;
  }

  if (command === "browser") {
    const payload = { positional: positional.slice(1), flags };
    const result = await browserCommand(payload);
    record(`browser ${positional.slice(1).join(" ")} ${JSON.stringify(flags)} => ${JSON.stringify(result)}`);
    console.log(`ok ${result.url || ""} ${result.title || ""}`.trim());

    if (result.value !== undefined) {
      console.log(`value: ${result.value}`);
    }

    if (result.count !== undefined) {
      console.log(`count: ${result.count}`);
    }

    if (result.key) {
      console.log(`storage ${result.key}: ${result.value}`);
    }

    return;
  }

  if (command === "api" && positional[1] === "search") {
    const detail = await apiSearch(flags);
    record(`api search ${JSON.stringify(flags)} => ${detail}`);
    console.log(`ok ${detail}`);
    return;
  }

  printUsage();
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  record(`error: ${message}`);
  console.error(message);
  process.exit(1);
});
