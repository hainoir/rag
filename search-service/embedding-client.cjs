const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1536;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_VECTOR_COLUMN = "embedding";
const DEFAULT_MODEL_COLUMN = "embedding_model";
const DEFAULT_EMBEDDED_AT_COLUMN = "embedded_at";
const PLACEHOLDER_VALUE_PATTERNS = [/^your[-_]/i, /^replace[-_]?me/i, /^example[-_]?/i];

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeIdentifier(value, fallback) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized || !/^[a-z_][a-z0-9_]*$/.test(normalized)) {
    return fallback;
  }

  return normalized.slice(0, 63);
}

function defaultQueryInstruction(model) {
  const normalizedModel = String(model ?? "").toLowerCase();

  if (normalizedModel.includes("qwen3-embedding")) {
    return "请将这个中文校园检索问题转换为检索向量，以便召回最相关的官方资料：";
  }

  return "";
}

function readEmbeddingConfig(env = process.env) {
  const apiKey = String(env.EMBEDDING_API_KEY ?? env.OPENAI_API_KEY ?? "").trim();
  const model = String(env.EMBEDDING_MODEL ?? env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const baseUrl = String(env.EMBEDDING_BASE_URL ?? env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  const vectorColumn = normalizeIdentifier(env.EMBEDDING_VECTOR_COLUMN, DEFAULT_VECTOR_COLUMN);
  const modelColumn = normalizeIdentifier(env.EMBEDDING_MODEL_COLUMN, DEFAULT_MODEL_COLUMN);
  const embeddedAtColumn = normalizeIdentifier(env.EMBEDDING_EMBEDDED_AT_COLUMN, DEFAULT_EMBEDDED_AT_COLUMN);
  const queryInstruction =
    String(env.EMBEDDING_QUERY_INSTRUCTION ?? "").trim() || defaultQueryInstruction(model);

  return {
    apiKey,
    model,
    baseUrl,
    dimensions: parsePositiveInteger(env.EMBEDDING_DIMENSIONS, DEFAULT_DIMENSIONS),
    timeoutMs: parsePositiveInteger(env.EMBEDDING_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    retryAttempts: parsePositiveInteger(env.EMBEDDING_RETRY_ATTEMPTS, DEFAULT_RETRY_ATTEMPTS),
    vectorColumn,
    modelColumn,
    embeddedAtColumn,
    queryInstruction,
  };
}

function isConfiguredValue(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return false;
  }

  return !PLACEHOLDER_VALUE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function shouldUseEmbeddings(config = readEmbeddingConfig()) {
  return isConfiguredValue(config.apiKey) && isConfiguredValue(config.model);
}

function formatQueryEmbeddingInput(query, config = readEmbeddingConfig()) {
  const normalizedQuery = String(query ?? "").trim();

  if (!normalizedQuery) {
    return "";
  }

  if (!config.queryInstruction) {
    return normalizedQuery;
  }

  return `${config.queryInstruction}\n${normalizedQuery}`;
}

function resolveEmbeddingEndpoint(baseUrl) {
  return baseUrl.replace(/\/+$/, "").endsWith("/embeddings")
    ? baseUrl.replace(/\/+$/, "")
    : `${baseUrl.replace(/\/+$/, "")}/embeddings`;
}

function isRetryableFetchError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const causeMessage = error && typeof error === "object" && error.cause ? String(error.cause.message ?? error.cause) : "";

  return /fetch failed|econnreset|etimedout|timed out|socket hang up|connection reset|temporary failure/i.test(
    `${message} ${causeMessage}`,
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const endpoint = resolveEmbeddingEndpoint(config.baseUrl);

  for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(endpoint, {
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
    } catch (error) {
      if (attempt >= config.retryAttempts || !isRetryableFetchError(error)) {
        const causeMessage =
          error && typeof error === "object" && error.cause ? ` cause=${String(error.cause.message ?? error.cause)}` : "";
        throw new Error(
          `Embedding request failed for ${endpoint} model=${config.model} attempt=${attempt}/${config.retryAttempts}: ${
            error instanceof Error ? error.message : String(error)
          }${causeMessage}`,
          {
            cause: error instanceof Error ? error : undefined,
          },
        );
      }

      await sleep(250 * attempt);
    } finally {
      clearTimeout(timeout);
    }
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
  formatQueryEmbeddingInput,
  formatVectorLiteral,
  generateEmbedding,
  generateEmbeddings,
  normalizeIdentifier,
  readEmbeddingConfig,
  isConfiguredValue,
  shouldUseEmbeddings,
};
