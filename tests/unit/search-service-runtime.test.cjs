const assert = require("node:assert/strict");

const { buildHealthSnapshot, readSearchServiceRuntimePreflight } = require("../../search-service/runtime-preflight.cjs");
const {
  buildPersistentMetricsSnapshot,
} = require("../../search-service/telemetry-store.cjs");
const {
  parseSearchFeedbackPayload,
  parseSearchQueryLogPayload,
} = require("../../search-service/telemetry-contract.cjs");

function test(name, task) {
  Promise.resolve()
    .then(task)
    .then(() => {
      console.log(`PASS ${name}`);
    })
    .catch((error) => {
      console.error(`FAIL ${name}`);
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    });
}

test("keeps seed mode healthy without a database", () => {
  const preflight = readSearchServiceRuntimePreflight({
    SEARCH_SERVICE_PROVIDER: "seed",
  });
  const snapshot = buildHealthSnapshot({
    preflight,
    databaseReachable: false,
    telemetryWritable: false,
    corpusSize: 4,
    timestamp: "2026-05-13T00:00:00.000Z",
  });

  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.provider, "seed");
  assert.equal(snapshot.databaseRequired, false);
  assert.equal(snapshot.telemetryRequired, false);
  assert.equal(snapshot.checks.databaseReachable, false);
  assert.equal(snapshot.checks.optionalFeatures.redis.status, "degraded");
});

test("keeps seed mode healthy even when DATABASE_URL is configured", () => {
  const preflight = readSearchServiceRuntimePreflight({
    SEARCH_SERVICE_PROVIDER: "seed",
    DATABASE_URL: "postgres://example",
  });
  const snapshot = buildHealthSnapshot({
    preflight,
    databaseReachable: false,
    telemetryWritable: false,
    corpusSize: 4,
  });

  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.databaseConfigured, true);
  assert.equal(snapshot.databaseRequired, false);
  assert.equal(snapshot.telemetryRequired, false);
});

test("marks postgres mode as error when the database is unreachable", () => {
  const preflight = readSearchServiceRuntimePreflight({
    SEARCH_SERVICE_PROVIDER: "postgres",
    DATABASE_URL: "postgres://example",
  });
  const snapshot = buildHealthSnapshot({
    preflight,
    databaseReachable: false,
    telemetryWritable: false,
    corpusSize: 4,
  });

  assert.equal(snapshot.status, "error");
  assert.equal(snapshot.databaseRequired, true);
  assert.equal(snapshot.telemetryRequired, true);
});

test("summarizes persistent metrics rows into JSON buckets", () => {
  const snapshot = buildPersistentMetricsSnapshot({
    windowHours: 24,
    summaryRow: {
      requests_total: 3,
      average_duration_ms: 123.45,
    },
    statusRows: [
      { status: "ok", count: 2 },
      { status: "error", count: 1 },
    ],
    cacheRows: [
      { cache_status: "hit", count: 1 },
      { cache_status: "miss", count: 2 },
    ],
    errorRows: [{ error_code: "upstream_timeout", count: 1 }],
    ingestionFailureRows: [
      {
        service: "ingestion-worker",
        level: "error",
        event: "scheduled_ingestion.failed",
        request_id: null,
        error_code: null,
        message: "detail page failed",
        payload: { sourceIds: ["tjcu-main-notices"] },
        created_at: new Date("2026-05-13T01:00:00.000Z"),
      },
    ],
  });

  assert.deepEqual(snapshot.byStatus, { ok: 2, error: 1 });
  assert.deepEqual(snapshot.byCacheStatus, { hit: 1, miss: 2 });
  assert.deepEqual(snapshot.byErrorCode, { upstream_timeout: 1 });
  assert.equal(snapshot.recentIngestionFailures[0].event, "scheduled_ingestion.failed");
});

test("validates feedback and query log telemetry payloads", () => {
  const feedback = parseSearchFeedbackPayload({
    requestId: "req-1",
    query: "图书馆借书",
    rating: "up",
    sourceIds: ["official-1"],
  });
  const queryLog = parseSearchQueryLogPayload({
    requestId: "req-2",
    query: "宿舍报修",
    status: "partial",
    retrievedCount: 2,
    sourceCount: 2,
    officialSourceCount: 1,
    communitySourceCount: 1,
    cacheStatus: "miss",
    gatewayEvent: "search_response",
  });

  assert.equal(feedback.ok, true);
  assert.equal(queryLog.ok, true);
});
