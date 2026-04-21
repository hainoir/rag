const http = require("node:http");
const { URL } = require("node:url");

const { defaultQuestions, seedCorpus } = require("./seed-corpus.cjs");

const DEFAULT_PORT = 8080;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;
const DEFAULT_DISCLAIMER = "如果问题涉及时间、费用、资格或办理流程，请以来源原文和最新公告为准。";

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildTerms(query) {
  const normalized = normalizeText(query);
  if (!normalized) {
    return [];
  }

  const asciiTerms = normalized
    .split(/[\s,.;:!?，。；：！？、/]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const compactCjk = normalized.replace(/[^\u4e00-\u9fff]/g, "");
  const cjkTerms = [];

  for (let index = 0; index < compactCjk.length - 1; index += 1) {
    cjkTerms.push(compactCjk.slice(index, index + 2));
  }

  return unique([normalized, ...asciiTerms, ...cjkTerms]);
}

function countMatches(haystack, terms, weight) {
  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) {
      score += weight;
    }
  }

  return score;
}

function scoreRecord(record, query, terms) {
  const normalizedQuery = normalizeText(query);
  const title = normalizeText(record.title);
  const snippet = normalizeText(record.snippet);
  const answer = normalizeText(record.answer);
  const keywords = (record.keywords ?? []).map((item) => normalizeText(item));
  const keywordText = keywords.join(" ");
  const fullText = normalizeText(
    [record.snippet, record.fullSnippet, record.answer, keywordText].join(" "),
  );

  let score = 0;

  if (title.includes(normalizedQuery)) {
    score += 28;
  }

  if (fullText.includes(normalizedQuery)) {
    score += 24;
  }

  score += countMatches(title, terms, 8);
  score += countMatches(snippet, terms, 5);
  score += countMatches(answer, terms, 4);
  score += countMatches(keywordText, terms, 6);

  for (const keyword of keywords) {
    if (normalizedQuery.includes(keyword) || keyword.includes(normalizedQuery)) {
      score += 10;
    }
  }

  if (record.type === "official") {
    score += 8;
  }

  score += Math.round((record.trustScore ?? 0.5) * 10);

  return score;
}

function pickMatchedKeywords(record, terms) {
  const keywords = Array.isArray(record.keywords) ? record.keywords : [];
  const matched = keywords.filter((keyword) => {
    const normalizedKeyword = normalizeText(keyword);

    return terms.some((term) => normalizedKeyword.includes(term) || term.includes(normalizedKeyword));
  });

  if (matched.length > 0) {
    return matched.slice(0, 5);
  }

  return keywords.slice(0, 5);
}

function buildSource(record, terms) {
  return {
    id: record.id,
    title: record.title,
    type: record.type,
    sourceName: record.sourceName,
    sourceDomain: record.sourceDomain,
    publishedAt: record.publishedAt ?? null,
    updatedAt: record.updatedAt ?? null,
    fetchedAt: record.fetchedAt,
    lastVerifiedAt: record.lastVerifiedAt ?? null,
    snippet: record.snippet,
    fullSnippet: record.fullSnippet,
    matchedKeywords: pickMatchedKeywords(record, terms),
    url: record.url,
    canonicalUrl: record.canonicalUrl,
    freshnessLabel: record.freshnessLabel ?? "undated",
    trustScore: record.trustScore,
    dedupKey: record.dedupKey,
  };
}

function buildSourceNote(results) {
  if (results.length === 0) {
    return "当前结果没有命中可展示的来源，请尝试换一个更具体的问题。";
  }

  const officialCount = results.filter((record) => record.type === "official").length;
  const communityCount = results.length - officialCount;

  if (officialCount > 0 && communityCount === 0) {
    return `当前结论主要基于 ${officialCount} 条官方来源整理，适合先看摘要，再回到原文逐条核对。`;
  }

  if (officialCount === 0) {
    return `当前结果主要来自 ${communityCount} 条社区来源，建议把它们当作经验补充，而不是最终依据。`;
  }

  return `当前结果综合了 ${officialCount} 条官方来源和 ${communityCount} 条社区来源，优先以官方信息为准。`;
}

function buildRelatedQuestions(query, results) {
  const output = [];
  const seen = new Set([normalizeText(query)]);

  for (const record of results) {
    for (const question of record.relatedQuestions ?? []) {
      const normalized = normalizeText(question);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      output.push(question);

      if (output.length >= 4) {
        return output;
      }
    }
  }

  for (const question of defaultQuestions) {
    const normalized = normalizeText(question);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(question);

    if (output.length >= 4) {
      break;
    }
  }

  return output;
}

function buildAnswer(query, results, scoredResults) {
  const primary = results.find((record) => record.type === "official") ?? results[0];
  const secondary = results.find((record) => record.id !== primary.id);
  const topScore = scoredResults[0]?.score ?? 0;
  const confidenceBase = primary.type === "official" ? 0.72 : 0.56;
  const confidence = clamp(confidenceBase + topScore / 100, 0.52, 0.94);
  const summaryParts = [primary.answer];

  if (secondary) {
    summaryParts.push(`补充参考：${secondary.answer}`);
  }

  return {
    summary: summaryParts.join(" "),
    sourceNote: buildSourceNote(results),
    disclaimer: DEFAULT_DISCLAIMER,
    confidence: Number(confidence.toFixed(2)),
  };
}

function buildEmptyResponse(query) {
  return {
    query,
    status: "empty",
    answer: null,
    sources: [],
    relatedQuestions: defaultQuestions,
    retrievedCount: 0,
    resultGeneratedAt: new Date().toISOString(),
  };
}

function search(query, limit) {
  const trimmedQuery = String(query ?? "").trim();
  if (!trimmedQuery) {
    return buildEmptyResponse("");
  }

  const terms = buildTerms(trimmedQuery);
  const scored = seedCorpus
    .map((record) => ({
      record,
      score: scoreRecord(record, trimmedQuery, terms),
    }))
    .filter((item) => item.score >= 18)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    return buildEmptyResponse(trimmedQuery);
  }

  const limited = scored.slice(0, limit);
  const results = limited.map((item) => item.record);
  const officialCount = results.filter((record) => record.type === "official").length;
  const status = officialCount === 0 ? "partial" : "ok";

  return {
    query: trimmedQuery,
    status,
    answer: buildAnswer(trimmedQuery, results, limited),
    sources: results.map((record) => buildSource(record, terms)),
    relatedQuestions: buildRelatedQuestions(trimmedQuery, results),
    retrievedCount: scored.length,
    resultGeneratedAt: new Date().toISOString(),
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

async function handleSearch(request, response, url) {
  let query = url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";
  let limitValue = url.searchParams.get("limit");

  if (request.method === "POST") {
    const body = await readJsonBody(request);
    if (typeof body.query === "string") {
      query = body.query;
    }
    if (body.limit !== undefined) {
      limitValue = body.limit;
    }
  }

  const limit = clamp(parsePositiveInteger(limitValue, DEFAULT_LIMIT), 1, MAX_LIMIT);
  sendJson(response, 200, search(query, limit));
}

const port = parsePositiveInteger(process.env.PORT, DEFAULT_PORT);
const host = process.env.HOST || DEFAULT_HOST;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      corpusSize: seedCorpus.length,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname !== "/api/search" || !["GET", "POST"].includes(request.method ?? "GET")) {
    sendJson(response, 404, {
      error: "Not Found",
    });
    return;
  }

  try {
    await handleSearch(request, response, url);
  } catch (error) {
    console.error("Upstream search service request failed.", error);
    sendJson(response, 500, {
      error: "Internal Server Error",
      message: "The upstream search service failed to process the request.",
    });
  }
});

server.listen(port, host, () => {
  console.log(`Upstream search service listening on http://${host}:${port}`);
  console.log(`Health check: http://${host}:${port}/health`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
