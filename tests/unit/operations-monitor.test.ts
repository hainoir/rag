import assert from "node:assert/strict";

import {
  evaluateOperationsSnapshot,
  readOperationsCheckConfig,
} from "../../src/lib/search/operations-monitor.ts";

function test(name: string, task: () => void | Promise<void>) {
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

test("derives health and metrics endpoints from SEARCH_SERVICE_URL", () => {
  const config = readOperationsCheckConfig({
    SEARCH_SERVICE_URL: "http://127.0.0.1:8080/api/search",
  } as NodeJS.ProcessEnv);

  assert.equal(config.healthUrl, "http://127.0.0.1:8080/health");
  assert.equal(config.metricsUrl, "http://127.0.0.1:8080/metrics");
});

test("honors direct health and metrics overrides", () => {
  const config = readOperationsCheckConfig({
    SEARCH_SERVICE_URL: "http://127.0.0.1:8080/api/search",
    SEARCH_SERVICE_HEALTH_URL: "https://ops.example.com/custom-health",
    SEARCH_SERVICE_METRICS_URL: "https://ops.example.com/custom-metrics",
  } as NodeJS.ProcessEnv);

  assert.equal(config.healthUrl, "https://ops.example.com/custom-health");
  assert.equal(config.metricsUrl, "https://ops.example.com/custom-metrics");
});

test("passes healthy snapshots when persistent metrics are within thresholds", () => {
  const config = readOperationsCheckConfig({
    SEARCH_SERVICE_URL: "http://127.0.0.1:8080/api/search",
    OPS_REQUIRE_PERSISTENT: "always",
    OPS_MAX_ERROR_RATE: "0.1",
    OPS_MAX_AVERAGE_DURATION_MS: "2000",
    OPS_MAX_UPSTREAM_TIMEOUTS: "2",
    OPS_MAX_RECENT_INGESTION_FAILURES: "0",
  } as NodeJS.ProcessEnv);

  const report = evaluateOperationsSnapshot(
    {
      status: "ok",
      databaseConfigured: true,
      checks: {
        databaseReachable: true,
        telemetryWritable: true,
      },
    },
    {
      persistent: {
        enabled: true,
        requestsTotal: 20,
        averageDurationMs: 420,
        byStatus: {
          ok: 19,
          error: 1,
        },
        byErrorCode: {
          upstream_timeout: 1,
        },
        recentIngestionFailures: [],
      },
    },
    config,
  );

  assert.equal(report.ok, true);
  assert.equal(report.failures.length, 0);
  assert.equal(report.summary.errorRate, 0.05);
});

test("fails degraded health when OPS_ALLOW_DEGRADED=false", () => {
  const config = readOperationsCheckConfig({
    SEARCH_SERVICE_URL: "http://127.0.0.1:8080/api/search",
    OPS_ALLOW_DEGRADED: "false",
    OPS_REQUIRE_PERSISTENT: "never",
  } as NodeJS.ProcessEnv);

  const report = evaluateOperationsSnapshot(
    {
      status: "degraded",
      databaseConfigured: false,
      checks: {},
    },
    {
      persistent: {
        enabled: false,
        reason: "database_unconfigured",
      },
    },
    config,
  );

  assert.equal(report.ok, false);
  assert.equal(report.failures[0]?.code, "health_degraded");
});

test("auto-requires persistent metrics when the database is configured", () => {
  const config = readOperationsCheckConfig({
    SEARCH_SERVICE_URL: "http://127.0.0.1:8080/api/search",
    OPS_REQUIRE_PERSISTENT: "auto",
  } as NodeJS.ProcessEnv);

  const report = evaluateOperationsSnapshot(
    {
      status: "ok",
      databaseConfigured: true,
      checks: {
        databaseReachable: true,
        telemetryWritable: false,
      },
    },
    {
      persistent: {
        enabled: false,
        reason: "telemetry_schema_missing",
      },
    },
    config,
  );

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.failures.map((failure) => failure.code),
    ["telemetry_unwritable", "persistent_metrics_disabled"],
  );
});

test("does not require persistent metrics for seed mode even if DATABASE_URL is configured", () => {
  const config = readOperationsCheckConfig({
    SEARCH_SERVICE_URL: "http://127.0.0.1:8080/api/search",
    OPS_REQUIRE_PERSISTENT: "auto",
  } as NodeJS.ProcessEnv);

  const report = evaluateOperationsSnapshot(
    {
      status: "ok",
      provider: "seed",
      databaseConfigured: true,
      databaseRequired: false,
      telemetryRequired: false,
      checks: {
        databaseReachable: false,
        telemetryWritable: false,
      },
    },
    {
      persistent: {
        enabled: false,
        reason: "database_unconfigured",
      },
    },
    config,
  );

  assert.equal(report.ok, true);
  assert.equal(report.failures.length, 0);
  assert.equal(report.summary.provider, "seed");
  assert.equal(report.summary.databaseRequired, false);
  assert.equal(report.summary.telemetryRequired, false);
});

test("fails when ingestion failures or timeout counts exceed thresholds", () => {
  const config = readOperationsCheckConfig({
    SEARCH_SERVICE_URL: "http://127.0.0.1:8080/api/search",
    OPS_REQUIRE_PERSISTENT: "always",
    OPS_MAX_UPSTREAM_TIMEOUTS: "0",
    OPS_MAX_RECENT_INGESTION_FAILURES: "0",
  } as NodeJS.ProcessEnv);

  const report = evaluateOperationsSnapshot(
    {
      status: "ok",
      databaseConfigured: true,
      checks: {
        databaseReachable: true,
        telemetryWritable: true,
      },
    },
    {
      persistent: {
        enabled: true,
        requestsTotal: 4,
        averageDurationMs: 320,
        byStatus: {
          ok: 4,
        },
        byErrorCode: {
          upstream_timeout: 1,
        },
        recentIngestionFailures: [{ event: "scheduled_ingestion.failed" }],
      },
    },
    config,
  );

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.failures.map((failure) => failure.code),
    ["upstream_timeouts_too_high", "recent_ingestion_failures_present"],
  );
});
