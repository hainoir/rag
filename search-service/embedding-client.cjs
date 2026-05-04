const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1536;
const DEFAULT_TIMEOUT_MS = 15_000;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readEmbeddingConfig(env = process.env) {
  const apiKey = String(env.EMBEDDING_API_KEY ?? env.OPENAI_API_KEY ?? "").trim();
  const model = String(env.EMBEDDING_MODEL ?? env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const baseUrl = String(env.EMBEDDING_BASE_URL ?? env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;

  return {
    apiKey,
    model,
    baseUrl,
    dimensions: parsePositiveInteger(env.EMBEDDING_DIMENSIONS, DEFAULT_DIMENSIONS),
    timeoutMs: parsePositiveInteger(env.EMBEDDING_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

function shouldUseEmbeddings(config = readEmbeddingConfig()) {
  return Boolean(config.apiKey && config.model);
}

function resolveEmbeddingEndpoint(baseUrl) {
  return baseUrl.replace(/\/+$/, "").endsWith("/embeddings")
    ? baseUrl.replace(/\/+$/, "")
    : `${baseUrl.replace(/\/+$/, "")}/embeddings`;
}

function assertEmbeddingVector(value, dimensions) {
  if (!Array.isArray(value) || value.length !== dimensions) {
    throw new Error(`Embedding response dimension mismatch. Expected ${dimensions}, got ${Array.isArray(value) ? value.length : "non-array"}.`);
  }

  return value.map((entry) => {
    const normalized = Number(entry);

    if (!Number.isFinite(normalized)) {
      throw new Error("Embedding response contains a non-finite value.");
    }

    return normalized;
  });
}

async function generateEmbeddings(inputs, config = readEmbeddingConfig()) {
  if (!shouldUseEmbeddings(config)) {
    throw new Error("EMBEDDING_API_KEY and EMBEDDING_MODEL are required to generate embeddings.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(resolveEmbeddingEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: inputs,
        model: config.model,
        dimensions: config.dimensions,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Embedding request failed with status ${response.status}: ${detail.slice(0, 240)}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];

    if (rows.length !== inputs.length) {
      throw new Error(`Embedding response count mismatch. Expected ${inputs.length}, got ${rows.length}.`);
    }

    return rows.map((row) => assertEmbeddingVector(row.embedding, config.dimensions));
  } finally {
    clearTimeout(timeout);
  }
}

async function generateEmbedding(input, config = readEmbeddingConfig()) {
  const [embedding] = await generateEmbeddings([input], config);
  return embedding;
}

function formatVectorLiteral(embedding) {
  return `[${embedding.map((value) => Number(value).toPrecision(10)).join(",")}]`;
}

module.exports = {
  formatVectorLiteral,
  generateEmbedding,
  generateEmbeddings,
  readEmbeddingConfig,
  shouldUseEmbeddings,
};
