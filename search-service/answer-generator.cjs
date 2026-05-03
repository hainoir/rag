const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_TEMPERATURE = 0.2;
const MAX_CONTEXT_SOURCES = 4;
const MAX_CONTEXT_CHARS = 900;

const ANSWER_MODES = new Set(["extractive", "llm", "auto"]);

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTemperature(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TEMPERATURE;
  }

  return Math.min(Math.max(parsed, 0), 1);
}

function clampConfidence(value, fallback) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  if (value > 1) {
    return Math.min(Math.max(value / 100, 0), 1);
  }

  return Math.min(Math.max(value, 0), 1);
}

function normalizeAnswerMode(value) {
  const normalized = String(value ?? "extractive").trim().toLowerCase();
  return ANSWER_MODES.has(normalized) ? normalized : "extractive";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function truncateText(value, maxChars) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}...`;
}

function buildChatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, "");

  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}

function readLlmConfig(env = process.env) {
  const apiKey = String(env.LLM_API_KEY ?? env.OPENAI_API_KEY ?? "").trim();
  const model = String(env.LLM_MODEL ?? env.OPENAI_MODEL ?? "").trim();

  return {
    mode: normalizeAnswerMode(env.SEARCH_ANSWER_MODE),
    apiKey,
    model,
    baseUrl: String(env.LLM_BASE_URL ?? env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL,
    timeoutMs: parsePositiveInteger(env.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    temperature: parseTemperature(env.LLM_TEMPERATURE),
  };
}

function shouldUseLlm(config) {
  if (config.mode === "extractive") {
    return false;
  }

  return Boolean(config.apiKey && config.model);
}

function buildSourceContext(sources) {
  return sources.slice(0, MAX_CONTEXT_SOURCES).map((source, index) => {
    const label = `S${index + 1}`;
    const content = truncateText(source.fullSnippet ?? source.snippet, MAX_CONTEXT_CHARS);

    return {
      label,
      sourceId: source.id,
      title: source.title,
      sourceName: source.sourceName,
      type: source.type,
      publishedAt: source.publishedAt,
      updatedAt: source.updatedAt,
      fetchedAt: source.fetchedAt,
      content,
    };
  });
}

function buildMessages(query, sourceContext) {
  const contextText = sourceContext
    .map((source) => {
      return [
        `[${source.label}]`,
        `sourceId: ${source.sourceId}`,
        `title: ${source.title}`,
        `sourceName: ${source.sourceName}`,
        `type: ${source.type}`,
        `publishedAt: ${source.publishedAt ?? "null"}`,
        `updatedAt: ${source.updatedAt ?? "null"}`,
        `fetchedAt: ${source.fetchedAt ?? "null"}`,
        `content: ${source.content}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "你是校园信息检索助手。只能依据用户提供的 evidence 片段回答，不要补充片段外事实。回答要简洁、可执行，并且必须把每个关键结论绑定到给定 sourceId。请只输出 JSON。",
    },
    {
      role: "user",
      content: [
        `用户问题：${query}`,
        "",
        "Evidence:",
        contextText,
        "",
        "输出 JSON 结构：",
        '{"summary":"不超过 180 字的中文回答；若证据不足，明确说当前来源无法确认","usedSourceIds":["实际使用到的 sourceId"],"confidence":0.0}',
      ].join("\n"),
    },
  ];
}

function parseJsonObject(text) {
  if (!isNonEmptyString(text)) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeUsedSourceIds(value, allowedIds) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const output = [];

  for (const item of value) {
    if (!isNonEmptyString(item)) {
      continue;
    }

    const sourceId = item.trim();

    if (!allowedIds.has(sourceId) || seen.has(sourceId)) {
      continue;
    }

    seen.add(sourceId);
    output.push(sourceId);
  }

  return output;
}

async function callChatCompletions(config, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`LLM request failed with ${response.status}: ${truncateText(body, 240)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (!isNonEmptyString(content)) {
      throw new Error("LLM response did not include message content.");
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateLlmAnswer(query, sources, baseAnswer, env = process.env) {
  const config = readLlmConfig(env);

  if (!shouldUseLlm(config)) {
    return null;
  }

  const sourceContext = buildSourceContext(sources);

  if (sourceContext.length === 0) {
    return null;
  }

  const content = await callChatCompletions(config, buildMessages(query, sourceContext));
  const parsed = parseJsonObject(content);

  if (!parsed || !isNonEmptyString(parsed.summary)) {
    throw new Error("LLM response was not valid answer JSON.");
  }

  const allowedIds = new Set(sourceContext.map((source) => source.sourceId));
  const usedSourceIds = normalizeUsedSourceIds(parsed.usedSourceIds, allowedIds);

  return {
    summary: truncateText(parsed.summary, 360),
    usedSourceIds,
    confidence: clampConfidence(parsed.confidence, baseAnswer?.confidence ?? 0.62),
  };
}

module.exports = {
  generateLlmAnswer,
  normalizeAnswerMode,
  readLlmConfig,
  shouldUseLlm,
};
