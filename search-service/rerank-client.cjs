const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_TOP_K = 20;

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

function shouldUseRerank(config = readRerankConfig()) {
  return Boolean(config.apiKey && config.model && config.baseUrl);
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
      throw new Error(`Rerank request failed with status ${response.status}: ${detail.slice(0, 240)}`);
    }

    return normalizeRerankResults(await response.json(), documents.length);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  readRerankConfig,
  rerankDocuments,
  shouldUseRerank,
};
