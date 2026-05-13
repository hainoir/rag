import type { OperationsCheckConfig, OperationsCheckFailure, OperationsCheckReport } from "./operations-monitor.ts";

export type OperationsScriptReport = OperationsCheckReport & {
  checkedAt: string;
  endpoints: {
    healthUrl: string | null;
    metricsUrl: string | null;
  };
  config: Pick<
    OperationsCheckConfig,
    | "allowDegraded"
    | "requirePersistent"
    | "maxErrorRate"
    | "maxAverageDurationMs"
    | "maxUpstreamTimeouts"
    | "maxRecentIngestionFailures"
  >;
  error?: {
    name?: string;
    message: string;
  };
};

export type OperationsAlertProvider = "generic" | "slack" | "feishu";

export type OperationsAlertNotifyMode = "failure" | "always";

export type OperationsAlertConfig = {
  webhookUrl: string | null;
  provider: OperationsAlertProvider;
  notifyOn: OperationsAlertNotifyMode;
  timeoutMs: number;
  source: string;
};

export function createEmptyOperationsSummary() {
  return {
    healthStatus: "unknown",
    provider: "unknown",
    databaseConfigured: false,
    databaseRequired: false,
    databaseReachable: null,
    telemetryRequired: false,
    telemetryWritable: null,
    persistentEnabled: false,
    requestsTotal: 0,
    errorCount: 0,
    errorRate: 0,
    averageDurationMs: 0,
    upstreamTimeouts: 0,
    recentIngestionFailureCount: 0,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseNonNegativeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function normalizeProvider(value: string | undefined): OperationsAlertProvider {
  const provider = String(value ?? "generic").trim().toLowerCase();

  if (provider === "slack" || provider === "feishu") {
    return provider;
  }

  return "generic";
}

function normalizeNotifyMode(value: string | undefined): OperationsAlertNotifyMode {
  const mode = String(value ?? "failure").trim().toLowerCase();
  return mode === "always" ? "always" : "failure";
}

export function readOperationsAlertConfig(env = process.env): OperationsAlertConfig {
  return {
    webhookUrl: isNonEmptyString(env.OPS_ALERT_WEBHOOK_URL) ? env.OPS_ALERT_WEBHOOK_URL.trim() : null,
    provider: normalizeProvider(env.OPS_ALERT_PROVIDER),
    notifyOn: normalizeNotifyMode(env.OPS_ALERT_NOTIFY_ON),
    timeoutMs: Math.max(500, parseNonNegativeNumber(env.OPS_ALERT_TIMEOUT_MS, 5_000)),
    source: isNonEmptyString(env.OPS_ALERT_SOURCE) ? env.OPS_ALERT_SOURCE.trim() : "phase-three-ops",
  };
}

export function shouldSendOperationsAlert(report: OperationsScriptReport, config: OperationsAlertConfig) {
  if (!config.webhookUrl) {
    return false;
  }

  if (config.notifyOn === "always") {
    return true;
  }

  return !report.ok;
}

function formatHealthFlag(value: boolean | null) {
  if (value === true) {
    return "yes";
  }

  if (value === false) {
    return "no";
  }

  return "unknown";
}

function formatFailure(failure: OperationsCheckFailure) {
  return `- ${failure.code}: ${failure.message}`;
}

export function formatOperationsAlertTitle(report: OperationsScriptReport, source = "phase-three-ops") {
  return report.ok ? `[OK] ${source}` : `[ALERT] ${source}`;
}

export function formatOperationsAlertText(report: OperationsScriptReport, source = "phase-three-ops") {
  const lines = [
    formatOperationsAlertTitle(report, source),
    `checkedAt=${report.checkedAt}`,
    `provider=${report.summary.provider}`,
    `healthStatus=${report.summary.healthStatus}`,
    `databaseRequired=${formatHealthFlag(report.summary.databaseRequired)}`,
    `databaseReachable=${formatHealthFlag(report.summary.databaseReachable)}`,
    `telemetryRequired=${formatHealthFlag(report.summary.telemetryRequired)}`,
    `telemetryWritable=${formatHealthFlag(report.summary.telemetryWritable)}`,
    `persistentEnabled=${formatHealthFlag(report.summary.persistentEnabled)}`,
    `requestsTotal=${report.summary.requestsTotal}`,
    `errorRate=${report.summary.errorRate}`,
    `averageDurationMs=${report.summary.averageDurationMs}`,
    `upstreamTimeouts=${report.summary.upstreamTimeouts}`,
    `recentIngestionFailureCount=${report.summary.recentIngestionFailureCount}`,
  ];

  if (report.error?.message) {
    lines.push(`runtimeError=${report.error.message}`);
  }

  if (report.failures.length > 0) {
    lines.push("failures:");
    lines.push(...report.failures.map(formatFailure));
  }

  return lines.join("\n");
}

export function formatOperationsSummaryMarkdown(report: OperationsScriptReport, source = "phase-three-ops") {
  const title = formatOperationsAlertTitle(report, source);
  const summaryRows = [
    "| Field | Value |",
    "| --- | --- |",
    `| checkedAt | ${report.checkedAt} |`,
    `| provider | ${report.summary.provider} |`,
    `| healthStatus | ${report.summary.healthStatus} |`,
    `| databaseRequired | ${formatHealthFlag(report.summary.databaseRequired)} |`,
    `| databaseReachable | ${formatHealthFlag(report.summary.databaseReachable)} |`,
    `| telemetryRequired | ${formatHealthFlag(report.summary.telemetryRequired)} |`,
    `| telemetryWritable | ${formatHealthFlag(report.summary.telemetryWritable)} |`,
    `| persistentEnabled | ${formatHealthFlag(report.summary.persistentEnabled)} |`,
    `| requestsTotal | ${report.summary.requestsTotal} |`,
    `| errorRate | ${report.summary.errorRate} |`,
    `| averageDurationMs | ${report.summary.averageDurationMs} |`,
    `| upstreamTimeouts | ${report.summary.upstreamTimeouts} |`,
    `| recentIngestionFailureCount | ${report.summary.recentIngestionFailureCount} |`,
  ];

  const sections = [`## ${title}`, "", ...summaryRows];

  if (report.error?.message) {
    sections.push("", `- runtimeError: ${report.error.message}`);
  }

  if (report.failures.length > 0) {
    sections.push("", "### Failures", "", ...report.failures.map(formatFailure));
  }

  return `${sections.join("\n")}\n`;
}

export function buildOperationsAlertPayload(
  report: OperationsScriptReport,
  provider: OperationsAlertProvider,
  source = "phase-three-ops",
) {
  const text = formatOperationsAlertText(report, source);
  const markdown = formatOperationsSummaryMarkdown(report, source);

  if (provider === "slack") {
    return {
      text,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: markdown,
          },
        },
      ],
    };
  }

  if (provider === "feishu") {
    return {
      msg_type: "text",
      content: {
        text,
      },
    };
  }

  return {
    status: report.ok ? "ok" : "alert",
    source,
    text,
    markdown,
    report,
  };
}

export function createOperationsRuntimeErrorReport({
  config,
  checkedAt = new Date().toISOString(),
  error,
}: {
  config: Pick<OperationsCheckConfig, "healthUrl" | "metricsUrl"> &
    Pick<
      OperationsCheckConfig,
      | "allowDegraded"
      | "requirePersistent"
      | "maxErrorRate"
      | "maxAverageDurationMs"
      | "maxUpstreamTimeouts"
      | "maxRecentIngestionFailures"
    >;
  checkedAt?: string;
  error: unknown;
}): OperationsScriptReport {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    checkedAt,
    endpoints: {
      healthUrl: config.healthUrl,
      metricsUrl: config.metricsUrl,
    },
    config: {
      allowDegraded: config.allowDegraded,
      requirePersistent: config.requirePersistent,
      maxErrorRate: config.maxErrorRate,
      maxAverageDurationMs: config.maxAverageDurationMs,
      maxUpstreamTimeouts: config.maxUpstreamTimeouts,
      maxRecentIngestionFailures: config.maxRecentIngestionFailures,
    },
    ok: false,
    failures: [
      {
        code: "ops_check_runtime_error",
        message: errorMessage,
      },
    ],
    summary: createEmptyOperationsSummary(),
    error: {
      name: error instanceof Error ? error.name : undefined,
      message: errorMessage,
    },
  };
}
