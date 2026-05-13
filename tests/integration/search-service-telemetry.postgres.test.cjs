const assert = require("node:assert/strict");

const { closePostgresPool, createServer } = require("../../search-service/server.cjs");
const { closeTelemetryPool } = require("../../search-service/telemetry-store.cjs");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for telemetry integration tests.");
  }

  process.env.SEARCH_SERVICE_PROVIDER = "seed";
  process.env.SEARCH_ANSWER_MODE = "extractive";
  process.env.SEARCH_SERVICE_API_KEY = "";
  process.env.SEARCH_SERVICE_AUTH_HEADER = "Authorization";

  const server = createServer();

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve the ephemeral search-service port.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
    assert.equal(typeof health.checks?.telemetryWritable, "boolean");
    assert.equal(health.databaseRequired, true);
    assert.equal(health.telemetryRequired, true);

    const queryLogResponse = await fetch(`${baseUrl}/api/query-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: "integration-log-1",
        query: "图书馆借书",
        status: "ok",
        retrievedCount: 3,
        sourceCount: 2,
        officialSourceCount: 2,
        communitySourceCount: 0,
        cacheStatus: "miss",
        durationMs: 120,
        gatewayEvent: "search_response",
      }),
    });
    assert.equal(queryLogResponse.status, 204);

    const feedbackResponse = await fetch(`${baseUrl}/api/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: "integration-feedback-1",
        query: "图书馆借书",
        rating: "up",
        sourceIds: ["official-1"],
      }),
    });
    assert.equal(feedbackResponse.status, 204);

    const metrics = await fetch(`${baseUrl}/metrics`).then((response) => response.json());
    assert.equal(metrics.persistent?.enabled, true);
    assert.equal(metrics.persistent?.requestsTotal >= 1, true);
    assert.equal(metrics.persistent?.byStatus?.ok >= 1, true);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await closePostgresPool();
    await closeTelemetryPool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
