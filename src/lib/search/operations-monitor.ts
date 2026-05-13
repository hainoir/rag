import { resolveSearchServiceSiblingEndpoint } from "./search-service-config.ts";

export type SearchServiceHealthStatus = "ok" | "degraded" | "error";

export type SearchServiceHealthSnapshot = {
  status?: SearchServiceHealthStatus | string;
  provider?: string;
  databaseConfigured?: boolean;
  databaseRequired?: boolean;
  telemetryRequired?: boolean;
  checks?: {
    databaseReachable?: boolean;
    telemetryWritable?: boolean;
    scheduledIngestionConfigured?: boolean;
  };
};

export type PersistentMetricsSnapshot = {
  enabled?: boolean;
  reason?: string;
  requestsTotal?: number;
  averageDurationMs?: number;
  byStatus?: Record<string, number>;
  byCacheStatus?: Record<string, number>;
  byErrorCode?: Record<string, number>;
  recentIngestionFailures?: Array<Record<string, unknown>>;
};

export type SearchServiceMetricsSnapshot = {
  requestsTotal?: number;
  averageDurationMs?: number;
  byStatus?: Record<string, number>;
  byResolvedProvider?: Record<string, number>;
  byFallbackReason?: Record<string, number>;
  byErrorCode?: Record<string, number>;
  persistent?: PersistentMetricsSnapshot;
};

export type OperationsCheckConfig = {
  healthUrl: string | null;
  metricsUrl: string | null;
  requestTimeoutMs: number;
  allowDegraded: boolean;
  requirePersistent: "auto" | "always" | "never";
  maxErrorRate: number;
  maxAverageDurationMs: number;
  maxUpstreamTimeouts: number;
  maxRecentIngestionFailures: number;
};

export type OperationsCheckFailure = {
  code: string;
  message: string;
};

export type OperationsCheckReport = {
  ok: boolean;
  failures: OperationsCheckFailure[];
  summary: {
    healthStatus: string;
    provider: string;
    databaseConfigured: boolean;
    databaseRequired: boolean;
    databaseReachable: boolean | null;
    telemetryRequired: boolean;
    telemetryWritable: boolean | null;
    persistentEnabled: boolean;
    persistentReason?: string;
    requestsTotal: number;
    errorCount: number;
    errorRate: number;
    averageDurationMs: number;
    upstreamTimeouts: number;
    recentIngestionFailureCount: number;
  };
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseBooleanFlag(value: string | undefined, fallback: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseNonNegativeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function resolveOperationsEndpoint(
  pathname: string,
  directEnvKey: "SEARCH_SERVICE_HEALTH_URL" | "SEARCH_SERVICE_METRICS_URL",
  env = process.env,
) {
  const direct = env[directEnvKey];

  if (isNonEmptyString(direct)) {
    return direct.trim();
  }

  return resolveSearchServiceSiblingEndpoint(pathname, env);
}

function normalizeRequirePersistent(value: string | undefined): "auto" | "always" | "never" {
  const normalized = String(value ?? "auto").trim().toLowerCase();

  if (normalized === "always" || normalized === "never") {
    return normalized;
  }

  return "auto";
}

function readOptionalNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readBucketCount(bucket: Record<string, number> | undefined, key: string) {
  const value = bucket?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeProvider(value: unknown) {
  const provider = String(value ?? "").trim().toLowerCase();

  return provider === "seed" || provider === "postgres" || provider === "auto" ? provider : "unknown";
}

function isDatabaseRequired(health: SearchServiceHealthSnapshot) {
  if (typeof health.databaseRequired === "boolean") {
    return health.databaseRequired;
  }

  const provider = normalizeProvider(health.provider);

  if (provider === "seed") {
    return false;
  }

  if (provider === "postgres") {
    return true;
  }

  return health.databaseConfigured === true;
}

function isTelemetryRequired(health: SearchServiceHealthSnapshot) {
  if (typeof health.telemetryRequired === "boolean") {
    return health.telemetryRequired;
  }

  return isDatabaseRequired(health);
}

function shouldRequirePersistent(config: OperationsCheckConfig, health: SearchServiceHealthSnapshot) {
  if (config.requirePersistent === "always") {
    return true;
  }

  if (config.requirePersistent === "never") {
    return false;
  }

  return isTelemetryRequired(health);
}

export function readOperationsCheckConfig(env = process.env): OperationsCheckConfig {
  return {
    healthUrl: resolveOperationsEndpoint("/health", "SEARCH_SERVICE_HEALTH_URL", env),
    metricsUrl: resolveOperationsEndpoint("/metrics", "SEARCH_SERVICE_METRICS_URL", env),
    requestTimeoutMs: Math.max(500, parseNonNegativeNumber(env.OPS_REQUEST_TIMEOUT_MS, 5_000)),
    allowDegraded: parseBooleanFlag(env.OPS_ALLOW_DEGRADED, false),
    requirePersistent: normalizeRequirePersistent(env.OPS_REQUIRE_PERSISTENT),
    maxErrorRate: parseNonNegativeNumber(env.OPS_MAX_ERROR_RATE, 0.2),
    maxAverageDurationMs: parseNonNegativeNumber(env.OPS_MAX_AVERAGE_DURATION_MS, 3_000),
    maxUpstreamTimeouts: parseNonNegativeNumber(env.OPS_MAX_UPSTREAM_TIMEOUTS, 5),
    maxRecentIngestionFailures: parseNonNegativeNumber(env.OPS_MAX_RECENT_INGESTION_FAILURES, 0),
  };
}

export function evaluateOperationsSnapshot(
  health: SearchServiceHealthSnapshot,
  metrics: SearchServiceMetricsSnapshot,
  config: OperationsCheckConfig,
): OperationsCheckReport {
  const failures: OperationsCheckFailure[] = [];
  const persistent = metrics.persistent;
  const persistentEnabled = persistent?.enabled === true;
  const requirePersistent = shouldRequirePersistent(config, health);
  const requestsTotal = readOptionalNumber(persistent?.requestsTotal);
  const errorCount = readBucketCount(persistent?.byStatus, "error");
  const errorRate = requestsTotal > 0 ? errorCount / requestsTotal : 0;
  const averageDurationMs = readOptionalNumber(persistent?.averageDurationMs);
  const upstreamTimeouts = readBucketCount(persistent?.byErrorCode, "upstream_timeout");
  const recentIngestionFailureCount = Array.isArray(persistent?.recentIngestionFailures)
    ? persistent.recentIngestionFailures.length
    : 0;
  const healthStatus = isNonEmptyString(health.status) ? health.status : "unknown";
  const provider = normalizeProvider(health.provider);
  const databaseConfigured = health.databaseConfigured === true;
  const databaseRequired = isDatabaseRequired(health);
  const databaseReachable =
    typeof health.checks?.databaseReachable === "boolean" ? health.checks.databaseReachable : null;
  const telemetryRequired = isTelemetryRequired(health);
  const telemetryWritable =
    typeof health.checks?.telemetryWritable === "boolean" ? health.checks.telemetryWritable : null;

  if (healthStatus === "error") {
    failures.push({
      code: "health_error",
      message: "search-service /health returned status=error.",
    });
  }

  if (healthStatus === "degraded" && !config.allowDegraded) {
    failures.push({
      code: "health_degraded",
      message: "search-service /health returned status=degraded while OPS_ALLOW_DEGRADED=false.",
    });
  }

  if (databaseRequired && databaseReachable === false) {
    failures.push({
      code: "database_unreachable",
      message: "Database is required for the current mode but /health checks.databaseReachable=false.",
    });
  }

  if (requirePersistent && telemetryRequired && telemetryWritable === false) {
    failures.push({
      code: "telemetry_unwritable",
      message: "Telemetry persistence is required but /health checks.telemetryWritable=false.",
    });
  }

  if (requirePersistent && !persistentEnabled) {
    failures.push({
      code: "persistent_metrics_disabled",
      message: `Persistent metrics are required but /metrics.persistent.enabled=false${
        persistent?.reason ? ` (${persistent.reason})` : ""
      }.`,
    });
  }

  if (persistentEnabled && errorRate > config.maxErrorRate) {
    failures.push({
      code: "error_rate_too_high",
      message: `Persistent error rate ${errorRate.toFixed(4)} exceeded OPS_MAX_ERROR_RATE=${config.maxErrorRate}.`,
    });
  }

  if (persistentEnabled && averageDurationMs > config.maxAverageDurationMs) {
    failures.push({
      code: "average_duration_too_high",
      message: `Persistent average duration ${averageDurationMs}ms exceeded OPS_MAX_AVERAGE_DURATION_MS=${config.maxAverageDurationMs}.`,
    });
  }

  if (persistentEnabled && upstreamTimeouts > config.maxUpstreamTimeouts) {
    failures.push({
      code: "upstream_timeouts_too_high",
      message: `Persistent upstream_timeout count ${upstreamTimeouts} exceeded OPS_MAX_UPSTREAM_TIMEOUTS=${config.maxUpstreamTimeouts}.`,
    });
  }

  if (persistentEnabled && recentIngestionFailureCount > config.maxRecentIngestionFailures) {
    failures.push({
      code: "recent_ingestion_failures_present",
      message: `Persistent recent ingestion failure count ${recentIngestionFailureCount} exceeded OPS_MAX_RECENT_INGESTION_FAILURES=${config.maxRecentIngestionFailures}.`,
    });
  }

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      healthStatus,
      provider,
      databaseConfigured,
      databaseRequired,
      databaseReachable,
      telemetryRequired,
      telemetryWritable,
      persistentEnabled,
      ...(persistent?.reason ? { persistentReason: persistent.reason } : {}),
      requestsTotal,
      errorCount,
      errorRate: Number(errorRate.toFixed(4)),
      averageDurationMs,
      upstreamTimeouts,
      recentIngestionFailureCount,
    },
  };
}
