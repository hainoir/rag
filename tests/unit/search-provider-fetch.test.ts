import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { NoticeDocument } from "../../src/lib/search/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return nextResolve(pathToFileURL(path.join(root, "node_modules/next/dist/compiled/server-only/empty.js")).href, context);
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });
const { searchServiceProvider } = await import("../../src/lib/search/search-provider.ts");
const originalFetch = globalThis.fetch;
const oldUrl = process.env.SEARCH_SERVICE_URL;
const oldKey = process.env.SEARCH_SERVICE_API_KEY;
const oldTimeout = process.env.SEARCH_SERVICE_TIMEOUT_MS;
const timestamp = "2026-10-29T00:00:00.000Z";
const secret = "provider-secret-value";
const bodySecret = "long-body-private-marker-".repeat(500);
const valid: NoticeDocument = { documentId: "doc one", versionNo: 1, title: "通知", type: "official", sourceName: "图书馆", publishedAt: null, updatedAt: null, fetchedAt: timestamp, lastVerifiedAt: null, answerEligible: true, body: bodySecret, truncated: false, bodyCharCount: bodySecret.length, returnedCharCount: bodySecret.length };
process.env.SEARCH_SERVICE_URL = "https://search.test/api/search";
process.env.SEARCH_SERVICE_API_KEY = secret;

async function test(name: string, task: () => Promise<void>) {
  try { await task(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`, error); process.exitCode = 1; }
}
function mock(response: Response | ((url: string, init?: RequestInit) => Promise<Response>)) {
  globalThis.fetch = (typeof response === "function" ? response : async () => response) as typeof fetch;
}

await test("GET uses sibling endpoint, shared auth and parses a complete document without logging body or key", async () => {
  const logs: string[] = [];
  const previous = console.log;
  console.log = (...args) => { logs.push(args.join(" ")); };
  try {
    mock(async (url, init) => {
      assert.equal(url, "https://search.test/api/documents/doc%20one");
      assert.equal(init?.method, "GET");
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${secret}`);
      return Response.json(valid);
    });
    const response = await searchServiceProvider.fetchNotice(" doc one ", { requestId: "req-1" });
    assert.equal(response.status, "ok");
    assert.deepEqual(response.document, valid);
    assert.match(logs.join("\n"), /req-1/);
    assert.doesNotMatch(logs.join("\n"), /long-body-private-marker|provider-secret-value/);
  } finally { console.log = previous; }
});

await test("blank document ID makes no request", async () => {
  mock(async () => { throw new Error("called"); });
  assert.equal((await searchServiceProvider.fetchNotice("  ")).status, "invalid");
});

await test("maps 400, 404, auth, and 503 to explicit statuses", async () => {
  for (const [code, expected] of [[400, "invalid"], [404, "not_found"], [401, "error"], [403, "error"], [503, "error"]] as const) {
    mock(new Response(JSON.stringify({ error: "sensitive-error-message" }), { status: code, headers: { "content-type": "application/json" } }));
    const response = await searchServiceProvider.fetchNotice("doc one");
    assert.equal(response.status, expected);
    assert.equal(response.document, null);
  }
});

await test("timeout and network errors degrade without throwing or exposing error text", async () => {
  const logs: string[] = [];
  const previous = console.error;
  console.error = (...args) => { logs.push(args.join(" ")); };
  try {
    mock(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    process.env.SEARCH_SERVICE_TIMEOUT_MS = "1";
    const timed = await searchServiceProvider.fetchNotice("doc one");
    assert.equal(timed.status, "error");
    assert.equal(timed.meta?.errorCode, "upstream_timeout");
    mock(async () => { throw new Error(secret); });
    assert.equal((await searchServiceProvider.fetchNotice("doc one")).status, "error");
    assert.doesNotMatch(logs.join("\n"), /provider-secret-value/);
  } finally { console.error = previous; delete process.env.SEARCH_SERVICE_TIMEOUT_MS; }
});

await test("malformed and partial JSON cannot be trusted as a notice", async () => {
  for (const value of [{ ...valid, body: undefined }, { ...valid, answerEligible: undefined }, { ...valid, returnedCharCount: 2 }, { ...valid, documentId: "different" }, { title: "old payload" }]) {
    mock(Response.json(value));
    const response = await searchServiceProvider.fetchNotice("doc one");
    assert.equal(response.status, "error");
    assert.equal(response.meta?.errorCode, "invalid_upstream_response");
  }
  mock(new Response("broken JSON", { status: 200, headers: { "content-type": "application/json" } }));
  assert.equal((await searchServiceProvider.fetchNotice("doc one")).status, "error");
});

await test("missing service URL returns an error without fetching", async () => {
  delete process.env.SEARCH_SERVICE_URL;
  mock(async () => { throw new Error("called"); });
  const response = await searchServiceProvider.fetchNotice("doc one");
  assert.equal(response.status, "error");
  assert.equal(response.meta?.errorCode, "missing_search_service_url");
  process.env.SEARCH_SERVICE_URL = "https://search.test/api/search";
});

globalThis.fetch = originalFetch;
if (oldUrl === undefined) delete process.env.SEARCH_SERVICE_URL; else process.env.SEARCH_SERVICE_URL = oldUrl;
if (oldKey === undefined) delete process.env.SEARCH_SERVICE_API_KEY; else process.env.SEARCH_SERVICE_API_KEY = oldKey;
if (oldTimeout === undefined) delete process.env.SEARCH_SERVICE_TIMEOUT_MS; else process.env.SEARCH_SERVICE_TIMEOUT_MS = oldTimeout;
