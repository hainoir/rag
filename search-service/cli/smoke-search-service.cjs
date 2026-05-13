const assert = require("node:assert/strict");

const { loadLocalEnv } = require("../load-env.cjs");
const { closePostgresPool, createServer, searchSeed } = require("../server.cjs");
const { closeTelemetryPool } = require("../telemetry-store.cjs");

loadLocalEnv();

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  assert.equal(response.ok, true, `Expected ${url} to return 2xx, got ${response.status}`);
  return response.json();
}

async function main() {
  const previousProvider = process.env.SEARCH_SERVICE_PROVIDER;
  const previousApiKey = process.env.SEARCH_SERVICE_API_KEY;
  const hitQuery = process.env.SEARCH_SMOKE_HIT_QUERY ?? "图书馆借书";
  const emptyQuery = process.env.SEARCH_SMOKE_EMPTY_QUERY ?? "明天校园集市几点开始";
  const limit = parsePositiveInteger(process.env.SEARCH_SMOKE_LIMIT, 3);
  const host = "127.0.0.1";
  const server = createServer();

  process.env.SEARCH_SERVICE_PROVIDER = "seed";
  delete process.env.SEARCH_SERVICE_API_KEY;

  try {
    const directResponse = searchSeed(hitQuery, limit);

    assert.ok(["ok", "partial"].includes(directResponse.status));
    assert.ok(directResponse.sources.length > 0, "Expected seed search to return at least one source.");
    assert.ok(directResponse.answer?.evidence?.length, "Expected seed search to return answer evidence.");

    const address = await listen(server, host);
    const baseUrl = `http://${host}:${address.port}`;
    const health = await requestJson(`${baseUrl}/health`);

    assert.equal(health.status, "ok");
    assert.equal(health.provider, "seed");
    assert.equal(typeof health.mode?.provider, "string");
    assert.equal(typeof health.checks?.telemetryWritable, "boolean");

    const hitResponse = await requestJson(`${baseUrl}/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: hitQuery,
        limit,
      }),
    });

    assert.ok(["ok", "partial"].includes(hitResponse.status));
    assert.ok(hitResponse.sources.length > 0, "Expected HTTP search to return at least one source.");
    assert.ok(hitResponse.answer?.evidence?.length, "Expected HTTP search to return answer evidence.");

    const emptyResponse = await requestJson(
      `${baseUrl}/api/search?q=${encodeURIComponent(emptyQuery)}&limit=${limit}`,
    );

    assert.equal(emptyResponse.status, "empty");
    assert.equal(emptyResponse.sources.length, 0);

    const metrics = await requestJson(`${baseUrl}/metrics`);

    assert.equal(metrics.requestsTotal >= 2, true);
    assert.equal(metrics.byResolvedProvider.seed >= 2, true);
    assert.equal(metrics.byStatus.ok >= 1, true);
    assert.equal(metrics.byStatus.empty >= 1, true);
    assert.equal(typeof metrics.persistent?.enabled, "boolean");

    console.log(
      [
        "Search service smoke passed:",
        `provider=seed`,
        `hitQuery="${hitQuery}"`,
        `hitSources=${hitResponse.sources.length}`,
        `emptyQuery="${emptyQuery}"`,
      ].join(" "),
    );
  } finally {
    if (previousProvider === undefined) {
      delete process.env.SEARCH_SERVICE_PROVIDER;
    } else {
      process.env.SEARCH_SERVICE_PROVIDER = previousProvider;
    }
    if (previousApiKey === undefined) {
      delete process.env.SEARCH_SERVICE_API_KEY;
    } else {
      process.env.SEARCH_SERVICE_API_KEY = previousApiKey;
    }

    if (server.listening) {
      await close(server);
    }

    await closePostgresPool();
    await closeTelemetryPool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
