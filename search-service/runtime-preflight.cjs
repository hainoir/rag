function isConfigured(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeProvider(value) {
  const normalized = String(value ?? "auto").trim().toLowerCase();
  return normalized === "seed" || normalized === "postgres" || normalized === "auto" ? normalized : "auto";
}

function readOptionalFeatureState(configured) {
  return {
    configured,
    status: configured ? "configured" : "degraded",
  };
}

function readSearchServiceRuntimePreflight(env = process.env) {
  const provider = normalizeProvider(env.SEARCH_SERVICE_PROVIDER);
  const hasDatabaseUrl = isConfigured(env.DATABASE_URL);
  const hasRedisUrl = isConfigured(env.REDIS_URL);
  const llmConfigured = isConfigured(env.LLM_API_KEY) && isConfigured(env.LLM_MODEL);
  const embeddingConfigured = isConfigured(env.EMBEDDING_API_KEY) && isConfigured(env.EMBEDDING_MODEL);
  const rerankConfigured =
    isConfigured(env.RERANK_API_KEY) && isConfigured(env.RERANK_BASE_URL) && isConfigured(env.RERANK_MODEL);

  return {
    provider,
    mode: {
      provider,
      answerMode: String(env.SEARCH_ANSWER_MODE ?? "extractive").trim().toLowerCase() || "extractive",
      retrievalMode: String(env.SEARCH_RETRIEVAL_MODE ?? "auto").trim().toLowerCase() || "auto",
      rerankMode: String(env.SEARCH_RERANK_MODE ?? "off").trim().toLowerCase() || "off",
    },
    hasDatabaseUrl,
    hasRedisUrl,
    scheduledIngestionConfigured: hasDatabaseUrl && hasRedisUrl,
    optionalFeatures: {
      redis: readOptionalFeatureState(hasRedisUrl),
      llm: readOptionalFeatureState(llmConfigured),
      embedding: readOptionalFeatureState(embeddingConfigured),
      rerank: readOptionalFeatureState(rerankConfigured),
    },
  };
}

function summarizeHealthStatus(preflight, checks) {
  if (preflight.provider === "postgres" && !checks.databaseReachable) {
    return "error";
  }

  if (preflight.provider === "auto" && preflight.hasDatabaseUrl && !checks.databaseReachable) {
    return "degraded";
  }

  if (preflight.provider !== "seed" && preflight.hasDatabaseUrl && !checks.telemetryWritable) {
    return "degraded";
  }

  return "ok";
}

function buildHealthSnapshot({
  preflight,
  databaseReachable,
  telemetryWritable,
  corpusSize,
  timestamp = new Date().toISOString(),
}) {
  const checks = {
    databaseReachable,
    telemetryWritable,
    scheduledIngestionConfigured: preflight.scheduledIngestionConfigured,
    optionalFeatures: preflight.optionalFeatures,
  };

  return {
    status: summarizeHealthStatus(preflight, checks),
    provider: preflight.provider,
    databaseConfigured: preflight.hasDatabaseUrl,
    corpusSize,
    timestamp,
    mode: preflight.mode,
    checks,
  };
}

module.exports = {
  buildHealthSnapshot,
  readSearchServiceRuntimePreflight,
  summarizeHealthStatus,
};
