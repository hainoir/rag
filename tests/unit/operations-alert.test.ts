import assert from "node:assert/strict";

import {
  buildOperationsAlertPayload,
  createOperationsRuntimeErrorReport,
  formatOperationsSummaryMarkdown,
  readOperationsAlertConfig,
  shouldSendOperationsAlert,
  type OperationsScriptReport,
} from "../../src/lib/search/operations-alert.ts";

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

function sampleReport(ok: boolean): OperationsScriptReport {
  return {
    checkedAt: "2026-05-13T00:00:00.000Z",
    endpoints: {
      healthUrl: "https://example.test/health",
      metricsUrl: "https://example.test/metrics",
    },
    config: {
      allowDegraded: false,
      requirePersistent: "auto",
      maxErrorRate: 0.2,
      maxAverageDurationMs: 3000,
      maxUpstreamTimeouts: 5,
      maxRecentIngestionFailures: 0,
    },
    ok,
    failures: ok
      ? []
      : [
          {
            code: "persistent_metrics_disabled",
            message: "Persistent metrics are required.",
          },
        ],
    summary: {
      healthStatus: ok ? "ok" : "degraded",
      provider: "postgres",
      databaseConfigured: true,
      databaseRequired: true,
      databaseReachable: true,
      telemetryRequired: true,
      telemetryWritable: ok,
      persistentEnabled: ok,
      requestsTotal: 12,
      errorCount: ok ? 0 : 2,
      errorRate: ok ? 0 : 0.1667,
      averageDurationMs: 420,
      upstreamTimeouts: ok ? 0 : 1,
      recentIngestionFailureCount: 0,
    },
  };
}

test("reads alert config with provider and notify defaults", () => {
  const config = readOperationsAlertConfig({
    OPS_ALERT_WEBHOOK_URL: " https://hooks.example.test/ops ",
    OPS_ALERT_PROVIDER: "slack",
    OPS_ALERT_NOTIFY_ON: "always",
    OPS_ALERT_TIMEOUT_MS: "2500",
    OPS_ALERT_SOURCE: "ci",
  } as NodeJS.ProcessEnv);

  assert.equal(config.webhookUrl, "https://hooks.example.test/ops");
  assert.equal(config.provider, "slack");
  assert.equal(config.notifyOn, "always");
  assert.equal(config.timeoutMs, 2500);
  assert.equal(config.source, "ci");
});

test("sends alerts on failures by default and can notify on success", () => {
  const config = readOperationsAlertConfig({
    OPS_ALERT_WEBHOOK_URL: "https://hooks.example.test/ops",
  } as NodeJS.ProcessEnv);
  const alwaysConfig = readOperationsAlertConfig({
    OPS_ALERT_WEBHOOK_URL: "https://hooks.example.test/ops",
    OPS_ALERT_NOTIFY_ON: "always",
  } as NodeJS.ProcessEnv);

  assert.equal(shouldSendOperationsAlert(sampleReport(false), config), true);
  assert.equal(shouldSendOperationsAlert(sampleReport(true), config), false);
  assert.equal(shouldSendOperationsAlert(sampleReport(true), alwaysConfig), true);
});

test("builds generic, slack, and feishu webhook payloads", () => {
  const report = sampleReport(false);
  const generic = buildOperationsAlertPayload(report, "generic", "ci");
  const slack = buildOperationsAlertPayload(report, "slack", "ci");
  const feishu = buildOperationsAlertPayload(report, "feishu", "ci");

  assert.equal(generic.status, "alert");
  assert.match(generic.text, /\[ALERT\] ci/);
  assert.equal(slack.blocks[0].type, "section");
  assert.match(slack.text, /persistent_metrics_disabled/);
  assert.equal(feishu.msg_type, "text");
  assert.match(feishu.content.text, /persistent_metrics_disabled/);
});

test("renders markdown summaries and runtime error reports", () => {
  const markdown = formatOperationsSummaryMarkdown(sampleReport(false), "ci");
  const errorReport = createOperationsRuntimeErrorReport({
    checkedAt: "2026-05-13T00:00:00.000Z",
    config: {
      healthUrl: null,
      metricsUrl: null,
      allowDegraded: false,
      requirePersistent: "auto",
      maxErrorRate: 0.2,
      maxAverageDurationMs: 3000,
      maxUpstreamTimeouts: 5,
      maxRecentIngestionFailures: 0,
    },
    error: new Error("missing endpoint"),
  });

  assert.match(markdown, /## \[ALERT\] ci/);
  assert.match(markdown, /persistent_metrics_disabled/);
  assert.equal(errorReport.ok, false);
  assert.equal(errorReport.failures[0].code, "ops_check_runtime_error");
  assert.equal(errorReport.error?.message, "missing endpoint");
});
