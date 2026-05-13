const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_TOP_K = 8;
const PLACEHOLDER_VALUE_PATTERNS = [/^your[-_]/i, /^replace[-_]?me/i, /^example[-_]?/i];

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readRerankConfig(env = process.env) {
  return {
    apiKey: String(env.RERANK_API_KEY ?? "").trim(),
    model: String(env.RERANK_MODEL ?? "").trim(),
    baseUrl: String(env.RERANK_BASE_URL ?? "").trim(),
    timeoutMs: parsePositiveInteger(env.RERANK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    topK: parsePositiveInteger(env.RERANK_TOP_K, DEFAULT_TOP_K),
  };
}

function isConfiguredValue(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return false;
  }

  return !PLACEHOLDER_VALUE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function shouldUseRerank(config = readRerankConfig()) {
  return (
    isConfiguredValue(config.apiKey) &&
    isConfiguredValue(config.model) &&
    isConfiguredValue(config.baseUrl) &&
    !config.baseUrl.includes(".example.com")
  );
}

function resolveRerankEndpoint(baseUrl) {
  return baseUrl.replace(/\/+$/, "").endsWith("/rerank")
    ? baseUrl.replace(/\/+$/, "")
    : `${baseUrl.replace(/\/+$/, "")}/rerank`;
}

function normalizeRerankResults(payload, expectedCount) {
  const rows = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  return rows
    .map((row) => ({
      index: Number(row.index ?? row.document_index),
      relevanceScore: Number(row.relevance_score ?? row.score ?? row.relevanceScore),
    }))
    .filter(
      (row) =>
        Number.isInteger(row.index) &&
        row.index >= 0 &&
        row.index < expectedCount &&
        Number.isFinite(row.relevanceScore),
    );
}

function buildRerankError(status, detail) {
  const message = `Rerank request failed with status ${status}: ${detail.slice(0, 240)}`;
  const error = new Error(message);

  if (status === 403 && /model disabled/i.test(detail)) {
    error.code = "model_disabled";
  } else if (status === 401) {
    error.code = "unauthorized";
  } else if (status === 429) {
    error.code = "rate_limited";
  } else {
    error.code = "request_failed";
  }

  return error;
}

async function rerankDocuments(query, documents, config = readRerankConfig()) {
  if (!shouldUseRerank(config)) {
    throw new Error("RERANK_API_KEY, RERANK_MODEL and RERANK_BASE_URL are required to rerank documents.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(resolveRerankEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        query,
        documents,
        top_n: documents.length,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw buildRerankError(response.status, detail);
    }

    return normalizeRerankResults(await response.json(), documents.length);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  readRerankConfig,
  rerankDocuments,
  isConfiguredValue,
  shouldUseRerank,
};
