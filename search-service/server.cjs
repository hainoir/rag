const http = require("node:http");
const { URL } = require("node:url");

const { generateLlmAnswer } = require("./answer-generator.cjs");
const {
  formatQueryEmbeddingInput,
  formatVectorLiteral,
  generateEmbedding,
  readEmbeddingConfig,
  shouldUseEmbeddings,
} = require("./embedding-client.cjs");
const { loadLocalEnv } = require("./load-env.cjs");
const { readRerankConfig, rerankDocuments, shouldUseRerank } = require("./rerank-client.cjs");
const { defaultQuestions, seedCorpus } = require("./seed-corpus.cjs");

loadLocalEnv();

const DEFAULT_PORT = 8080;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;
const DEFAULT_CANDIDATE_LIMIT = 80;
const DEFAULT_DISCLAIMER = "如果问题涉及时间、费用、资格或办理流程，请以来源原文和最新公告为准。";
const ALLOWED_PROVIDERS = new Set(["auto", "postgres", "seed"]);
const ALLOWED_RETRIEVAL_MODES = new Set(["auto", "lexical", "hybrid"]);
const ALLOWED_RERANK_MODES = new Set(["auto", "off", "on"]);
const GENERIC_QUERY_TERMS = new Set([
  "今天",
  "明天",
  "昨天",
  "校园",
  "学校",
  "大学",
  "天津",
  "商业",
  "开始",
  "几点",
  "哪里",
  "什么",
  "怎么",
  "如何",
  "一般",
  "时候",
  "需要",
  "办理",
  "流程",
  "通知",
  "公告",
  "查询",
  "相关",
  "问题",
]);
const POSTGRES_SCORING = {
  titleExactMatch: 30,
  fullSnippetExactMatch: 24,
  titleTermWeight: 10,
  snippetTermWeight: 6,
  fullSnippetTermWeight: 4,
  sourceNameTermWeight: 1,
  titleIntentCoverageWeight: 6,
  titleIntentCoverageBonus: 8,
  officialBonus: 10,
  trustScoreWeight: 10,
  freshBonus: 3,
  recentBonus: 1,
  trigramWeight: 18,
  vectorWeight: 26,
  minimumScore: 12,
};

let postgresPool = null;
let PostgresPoolCtor = null;
const searchMetrics = {
  startedAt: new Date().toISOString(),
  requestsTotal: 0,
  durationMsTotal: 0,
  byResolvedProvider: {},
  byStatus: {},
  byFallbackReason: {},
  byErrorCode: {},
};

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

function summarizeSnippet(value) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function incrementMetric(bucket, key) {
  if (!key) {
    return;
  }

  bucket[key] = (bucket[key] ?? 0) + 1;
}

function recordSearchMetric({ resolvedProvider, status, fallbackReason, errorCode, durationMs }) {
  searchMetrics.requestsTotal += 1;
  searchMetrics.durationMsTotal += durationMs;
  incrementMetric(searchMetrics.byResolvedProvider, resolvedProvider);
  incrementMetric(searchMetrics.byStatus, status);
  incrementMetric(searchMetrics.byFallbackReason, fallbackReason);
  incrementMetric(searchMetrics.byErrorCode, errorCode);
}

function getMetricsSnapshot() {
  return {
    ...searchMetrics,
    averageDurationMs:
      searchMetrics.requestsTotal > 0
        ? Number((searchMetrics.durationMsTotal / searchMetrics.requestsTotal).toFixed(2))
        : 0,
    timestamp: new Date().toISOString(),
  };
}

function normalizeProvider(value) {
  const provider = String(value ?? "auto").trim().toLowerCase();
  return ALLOWED_PROVIDERS.has(provider) ? provider : "auto";
}

function normalizeRetrievalMode(value) {
  const mode = String(value ?? "auto").trim().toLowerCase();
  return ALLOWED_RETRIEVAL_MODES.has(mode) ? mode : "auto";
}

function normalizeRerankMode(value) {
  const mode = String(value ?? "auto").trim().toLowerCase();
  return ALLOWED_RERANK_MODES.has(mode) ? mode : "auto";
}

function resolvePostgresPoolCtor() {
  if (!PostgresPoolCtor) {
    ({ Pool: PostgresPoolCtor } = require("pg"));
  }

  return PostgresPoolCtor;
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid schema identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function getSearchSchema() {
  return process.env.SEARCH_DATABASE_SCHEMA || process.env.DATABASE_SCHEMA || "public";
}

function getPostgresPool() {
  const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();

  if (!databaseUrl) {
    return null;
  }

  if (!postgresPool) {
    const Pool = resolvePostgresPoolCtor();
    postgresPool = new Pool({
      connectionString: databaseUrl,
    });
  }

  return postgresPool;
}

async function closePostgresPool() {
  if (!postgresPool) {
    return;
  }

  const pool = postgresPool;
  postgresPool = null;
  await pool.end();
}

function isRetryablePostgresConnectionError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /connection terminated unexpectedly|connection terminated|server closed the connection unexpectedly|econnreset/i.test(
    message,
  );
}

async function withPostgresClient(task, attempt = 1) {
  const pool = getPostgresPool();

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  let client = null;
  let released = false;

  try {
    client = await pool.connect();
    await client.query(`set search_path to ${quoteIdentifier(getSearchSchema())}, public`);
    return await task(client);
  } catch (error) {
    if (client && !released) {
      try {
        client.release(true);
        released = true;
      } catch {
        // Ignore release failures for broken connections and rebuild the pool below.
      }
    }

    if (attempt < 2 && isRetryablePostgresConnectionError(error)) {
      try {
        await closePostgresPool();
      } catch {
        // Ignore pool shutdown errors; the retry will rebuild it.
      }
      return withPostgresClient(task, attempt + 1);
    }

    throw error;
  } finally {
    if (client && !released) {
      client.release();
    }
  }
}

async function hasVectorColumn(client) {
  const embeddingConfig = readEmbeddingConfig();
  const result = await client.query(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = $1
          and table_name = 'chunks'
          and column_name = $2
      ) as exists
    `,
    [getSearchSchema(), embeddingConfig.vectorColumn],
  );

  return Boolean(result.rows[0]?.exists);
}

async function maybeBuildQueryEmbeddingLiteral(client, query, retrievalMode = normalizeRetrievalMode()) {
  if (retrievalMode === "lexical") {
    return null;
  }

  const embeddingConfig = readEmbeddingConfig();

  if (!shouldUseEmbeddings(embeddingConfig)) {
    return null;
  }

  if (!(await hasVectorColumn(client))) {
    return null;
  }

  try {
    const embedding = await generateEmbedding(formatQueryEmbeddingInput(query, embeddingConfig), embeddingConfig);

    return {
      literal: formatVectorLiteral(embedding),
      model: embeddingConfig.model,
    };
  } catch (error) {
    logSearchEvent("error", {
      event: "embedding.query_failed",
      model: embeddingConfig.model,
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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

function isSpecificTerm(term) {
  const normalized = normalizeText(term);
  return normalized.length >= 2 && !GENERIC_QUERY_TERMS.has(normalized);
}

function pickSpecificTerms(terms) {
  return terms.filter(isSpecificTerm);
}

function pickScoringTerms(terms) {
  const specificTerms = pickSpecificTerms(terms);
  return specificTerms.length > 0 ? specificTerms : terms;
}

function buildSearchPatterns(query, terms) {
  const specificTerms = pickSpecificTerms(terms);
  const candidates = unique([
    normalizeText(query),
    ...(specificTerms.length > 0 ? specificTerms : terms),
  ])
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 24);

  return candidates.length > 0 ? candidates.map((term) => `%${term}%`) : [`%${query.trim()}%`];
}

function countMatches(haystack, terms, weight) {
  let score = 0;

  for (const term of terms) {
    const normalizedTerm = normalizeText(term);

    if (!isSpecificTerm(normalizedTerm)) {
      continue;
    }

    if (haystack.includes(normalizedTerm)) {
      score += weight + Math.min(4, Math.max(0, normalizedTerm.length - 2));
    }
  }

  return score;
}

function hasSpecificTermMatch(haystack, terms) {
  const normalizedHaystack = normalizeText(haystack);
  return pickSpecificTerms(terms).some((term) => normalizedHaystack.includes(term));
}

function countSpecificTermHits(haystack, terms) {
  const normalizedHaystack = normalizeText(haystack);

  return unique(
    terms
      .map((term) => normalizeText(term))
      .filter((term) => isSpecificTerm(term) && normalizedHaystack.includes(term)),
  ).length;
}

function getGenericTitlePenalty(title, titleSpecificHits) {
  const normalizedTitle = normalizeText(title);
  let penalty = 0;

  if (/^\d{4}$/.test(normalizedTitle)) {
    penalty += 14;
  }

  if (normalizedTitle === "招生动态") {
    penalty += 8;
  }

  if (titleSpecificHits === 0) {
    if (normalizedTitle.endsWith("通知") || normalizedTitle.endsWith("公告") || normalizedTitle.endsWith("公示")) {
      penalty += 6;
    }

    if (normalizedTitle.includes("动态")) {
      penalty += 4;
    }
  } else if (titleSpecificHits === 1 && normalizedTitle.endsWith("通知")) {
    penalty += 2;
  }

  return penalty;
}

function scoreRecord(record, query, terms) {
  const normalizedQuery = normalizeText(query);
  const scoringTerms = pickScoringTerms(terms);
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

  score += countMatches(title, scoringTerms, 8);
  score += countMatches(snippet, scoringTerms, 5);
  score += countMatches(answer, scoringTerms, 4);
  score += countMatches(keywordText, scoringTerms, 6);

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

function pickMatchedTermsFromText(terms, query, text) {
  const normalizedText = normalizeText(text);
  const scoringTerms = pickScoringTerms(terms);
  const matched = unique(
    scoringTerms.filter((term) => {
      const normalizedTerm = normalizeText(term);
      return normalizedTerm.length >= 2 && normalizedText.includes(normalizedTerm);
    }),
  );

  if (matched.length > 0) {
    return matched.slice(0, 5);
  }

  const tokens = buildTerms(query);
  return tokens.length > 0 ? tokens.slice(0, 5) : [query.trim()].filter(Boolean);
}

function toIsoTimestamp(value, fallback = new Date().toISOString()) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const normalized = new Date(value);
    return Number.isNaN(normalized.getTime()) ? fallback : normalized.toISOString();
  }

  return fallback;
}

function toNullableIsoTimestamp(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = toIsoTimestamp(value, "");
  return normalized || null;
}

function deriveSourceDomain(url) {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function deriveFreshnessLabel(source, generatedAt) {
  const reference =
    source.lastVerifiedAt ?? source.updatedAt ?? source.publishedAt ?? source.fetchedAt ?? null;

  if (!reference) {
    return "undated";
  }

  const generatedAtMs = Date.parse(generatedAt);
  const referenceMs = Date.parse(reference);

  if (Number.isNaN(generatedAtMs) || Number.isNaN(referenceMs)) {
    return "undated";
  }

  const ageInDays = Math.floor((generatedAtMs - referenceMs) / (1000 * 60 * 60 * 24));

  if (ageInDays <= 3) {
    return "fresh";
  }

  if (ageInDays <= 30) {
    return "recent";
  }

  return "stale";
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

function buildPostgresSource(row, terms, query, generatedAt) {
  const fetchedAt = toIsoTimestamp(row.fetched_at, generatedAt);
  const source = {
    id: row.chunk_id,
    title: row.title,
    type: row.source_type === "community" ? "community" : "official",
    sourceName: row.source_name,
    sourceDomain: deriveSourceDomain(row.url),
    publishedAt: toNullableIsoTimestamp(row.published_at),
    updatedAt: toNullableIsoTimestamp(row.updated_at),
    fetchedAt,
    lastVerifiedAt: toNullableIsoTimestamp(row.last_verified_at),
    snippet: row.snippet,
    fullSnippet: row.full_snippet,
    matchedKeywords: pickMatchedTermsFromText(
      terms,
      query,
      `${row.title} ${row.snippet} ${row.full_snippet}`,
    ),
    url: row.url,
    canonicalUrl: row.canonical_url,
    trustScore: typeof row.trust_score === "number" ? clamp(row.trust_score, 0, 1) : undefined,
    dedupKey: row.dedup_key,
  };

  return {
    ...source,
    freshnessLabel: deriveFreshnessLabel(source, generatedAt),
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
    evidence: results.slice(0, 4).map((record) => ({
      sourceId: record.id,
      title: record.title,
      sourceName: record.sourceName,
      snippet: summarizeSnippet(record.snippet),
    })),
  };
}

function buildExtractiveAnswer(query, sources, scoredResults) {
  const evidence = sources.slice(0, 4).map((source) => ({
    sourceId: source.id,
    title: source.title,
    sourceName: source.sourceName,
    snippet: source.snippet,
  }));
  const topSnippets = evidence
    .slice(0, 3)
    .map((item) => summarizeSnippet(item.snippet))
    .filter(Boolean);
  const officialCount = sources.filter((source) => source.type === "official").length;
  const topScore = scoredResults[0]?.score ?? 0;
  const confidenceBase = officialCount > 0 ? 0.66 : 0.48;
  const confidence = clamp(confidenceBase + topScore / 140, 0.45, 0.9);

  return {
    summary:
      topSnippets.length > 0
        ? `针对“${query}”，当前检索到的高相关片段显示：${topSnippets.join(" ")}`
        : `针对“${query}”，当前检索到相关来源，但片段内容不足以形成完整摘要。`,
    sourceNote: buildSourceNote(sources),
    disclaimer: DEFAULT_DISCLAIMER,
    confidence: Number(confidence.toFixed(2)),
    evidence,
  };
}

function buildAnswerEvidenceFromSources(sources) {
  return sources.slice(0, 4).map((source) => ({
    sourceId: source.id,
    title: source.title,
    sourceName: source.sourceName,
    snippet: summarizeSnippet(source.snippet),
  }));
}

function pickEvidenceSources(sources, usedSourceIds) {
  if (!Array.isArray(usedSourceIds) || usedSourceIds.length === 0) {
    return sources.slice(0, 4);
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const selected = usedSourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .filter(Boolean);

  return selected.length > 0 ? selected : sources.slice(0, 4);
}

async function enhanceResponseWithLlmAnswer(response) {
  if (!response.answer || response.sources.length === 0 || response.status === "empty" || response.status === "error") {
    return response;
  }

  try {
    const generated = await generateLlmAnswer(response.query, response.sources, response.answer);

    if (!generated) {
      return response;
    }

    const evidenceSources = pickEvidenceSources(response.sources, generated.usedSourceIds);

    return {
      ...response,
      answer: {
        ...response.answer,
        summary: generated.summary,
        confidence: generated.confidence,
        evidence: buildAnswerEvidenceFromSources(evidenceSources),
      },
    };
  } catch (error) {
    console.error("LLM answer generation failed; falling back to extractive answer.", error);
    return response;
  }
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

function searchSeed(query, limit) {
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
    .filter((item) => {
      const searchableText = [
        item.record.title,
        item.record.snippet,
        item.record.fullSnippet,
        item.record.answer,
        ...(item.record.keywords ?? []),
      ].join(" ");

      return item.score >= 18 && hasSpecificTermMatch(searchableText, terms);
    })
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

function scorePostgresSource(source, query, terms) {
  const normalizedQuery = normalizeText(query);
  const scoringTerms = pickScoringTerms(terms);
  const title = normalizeText(source.title);
  const snippet = normalizeText(source.snippet);
  const fullSnippet = normalizeText(source.fullSnippet ?? source.snippet);
  const sourceName = normalizeText(source.sourceName);
  const lexicalText = `${title} ${snippet} ${fullSnippet}`;

  if (!hasSpecificTermMatch(lexicalText, terms)) {
    return 0;
  }

  const titleSpecificHits = countSpecificTermHits(title, scoringTerms);
  const bodySpecificHits = countSpecificTermHits(`${snippet} ${fullSnippet}`, scoringTerms);
  const hasExactQueryIntent = title.includes(normalizedQuery) || fullSnippet.includes(normalizedQuery);

  if (!hasExactQueryIntent && titleSpecificHits === 0 && bodySpecificHits < 2) {
    return 0;
  }

  let score = 0;

  if (title.includes(normalizedQuery)) {
    score += POSTGRES_SCORING.titleExactMatch;
  }

  if (fullSnippet.includes(normalizedQuery)) {
    score += POSTGRES_SCORING.fullSnippetExactMatch;
  }

  score += countMatches(title, scoringTerms, POSTGRES_SCORING.titleTermWeight);
  score += countMatches(snippet, scoringTerms, POSTGRES_SCORING.snippetTermWeight);
  score += countMatches(fullSnippet, scoringTerms, POSTGRES_SCORING.fullSnippetTermWeight);
  score += countMatches(sourceName, scoringTerms, POSTGRES_SCORING.sourceNameTermWeight);
  score += titleSpecificHits * POSTGRES_SCORING.titleIntentCoverageWeight;

  if (titleSpecificHits > 0 && bodySpecificHits > 0) {
    score += POSTGRES_SCORING.titleIntentCoverageBonus;
  }

  score -= getGenericTitlePenalty(title, titleSpecificHits);

  if (source.type === "official") {
    score += POSTGRES_SCORING.officialBonus;
  }

  score += Math.round((source.trustScore ?? 0.72) * POSTGRES_SCORING.trustScoreWeight);

  if (source.freshnessLabel === "fresh") {
    score += POSTGRES_SCORING.freshBonus;
  } else if (source.freshnessLabel === "recent") {
    score += POSTGRES_SCORING.recentBonus;
  }

  return Math.max(0, score);
}

function buildRerankDocument(source) {
  return [
    `title: ${source.title}`,
    `source: ${source.sourceName}`,
    `type: ${source.type}`,
    `snippet: ${source.snippet}`,
    `fullSnippet: ${source.fullSnippet ?? source.snippet}`,
  ]
    .join("\n")
    .slice(0, 4_000);
}

async function maybeRerankScoredItems(query, items, limit, rerankMode = normalizeRerankMode()) {
  const rerankConfig = readRerankConfig();

  if (rerankMode === "off" || items.length <= 1) {
    return items;
  }

  if (!shouldUseRerank(rerankConfig)) {
    if (rerankMode === "on") {
      logSearchEvent("info", {
        event: "rerank.skipped",
        reason: "unconfigured",
      });
    }

    return items;
  }

  const rerankLimit = clamp(rerankConfig.topK, limit, Math.min(items.length, 50));
  const head = items.slice(0, rerankLimit);
  const tail = items.slice(rerankLimit);

  try {
    const reranked = await rerankDocuments(query, head.map((item) => buildRerankDocument(item.source)), rerankConfig);
    const scoreByIndex = new Map(reranked.map((item) => [item.index, item.relevanceScore]));
    const rerankedHead = head
      .map((item, index) => ({
        ...item,
        rerankScore: scoreByIndex.get(index) ?? 0,
      }))
      .sort((left, right) => {
        const rerankDelta = right.rerankScore - left.rerankScore;

        return rerankDelta !== 0 ? rerankDelta : right.score - left.score;
      });

    logSearchEvent("info", {
      event: "rerank.completed",
      model: rerankConfig.model,
      candidateCount: head.length,
      returnedCount: reranked.length,
    });

    return [...rerankedHead, ...tail];
  } catch (error) {
    logSearchEvent("error", {
      event: "rerank.failed",
      model: rerankConfig.model,
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return items;
  }
}

async function searchPostgres(query, limit, options = {}) {
  const trimmedQuery = String(query ?? "").trim();

  if (!trimmedQuery) {
    return buildEmptyResponse("");
  }

  const generatedAt = new Date().toISOString();
  const terms = buildTerms(trimmedQuery);
  const patterns = buildSearchPatterns(trimmedQuery, terms);
  const candidateLimit = clamp(limit * 8, limit, DEFAULT_CANDIDATE_LIMIT);
  const retrievalMode = normalizeRetrievalMode(options.retrievalMode ?? process.env.SEARCH_RETRIEVAL_MODE);
  const rerankMode = normalizeRerankMode(options.rerankMode ?? process.env.SEARCH_RERANK_MODE);
  const embeddingConfig = readEmbeddingConfig();
  const vectorColumnIdentifier = quoteIdentifier(embeddingConfig.vectorColumn);

  const rows = await withPostgresClient(async (client) => {
    const vectorQuery = await maybeBuildQueryEmbeddingLiteral(client, trimmedQuery, retrievalMode);

    if (vectorQuery) {
      const result = await client.query(
        `
          with latest_versions as (
            select distinct on (document_id)
              document_id,
              id as version_id
            from document_versions
            order by document_id, version_no desc
          ),
          vector_candidates as (
            select
              c.id as chunk_id
            from chunks c
            join latest_versions lv on lv.version_id = c.document_version_id
            join documents d on d.id = lv.document_id
            where c.${vectorColumnIdentifier} is not null
              and d.status = 'active'
            order by c.${vectorColumnIdentifier} <=> $4::vector
            limit $2
          )
          select
            c.id::text as chunk_id,
            c.chunk_index,
            c.snippet,
            c.full_snippet,
            d.id::text as document_id,
            d.source_id,
            d.source_type,
            d.source_name,
            d.title,
            d.url,
            d.canonical_url,
            d.published_at,
            d.updated_at,
            d.fetched_at,
            d.last_verified_at,
            d.dedup_key,
            coalesce(sr.trust_weight, 0.72)::float as trust_score,
            greatest(
              similarity(d.title, $3),
              similarity(c.snippet, $3),
              similarity(c.full_snippet, $3)
            )::float as trigram_score,
            case
              when c.${vectorColumnIdentifier} is null then 0
              else greatest(0, 1 - (c.${vectorColumnIdentifier} <=> $4::vector))
            end::float as vector_score
          from chunks c
          join latest_versions lv on lv.version_id = c.document_version_id
          join documents d on d.id = lv.document_id
          left join source_registry sr on sr.id = d.source_id
          where d.status = 'active'
            and (
              d.title ilike any($1::text[])
              or c.snippet ilike any($1::text[])
              or c.full_snippet ilike any($1::text[])
              or d.title % $3
              or c.snippet % $3
              or c.full_snippet % $3
              or c.id in (select chunk_id from vector_candidates)
            )
          order by
            vector_score desc,
            trigram_score desc,
            case when d.source_type = 'official' then 1 else 0 end desc,
            coalesce(sr.trust_weight, 0.72) desc,
            coalesce(d.last_verified_at, d.updated_at, d.published_at, d.fetched_at) desc nulls last
          limit $2
        `,
        [patterns, candidateLimit, trimmedQuery, vectorQuery.literal],
      );

      return result.rows;
    }

    const result = await client.query(
      `
        with latest_versions as (
          select distinct on (document_id)
            document_id,
            id as version_id
          from document_versions
          order by document_id, version_no desc
        )
        select
          c.id::text as chunk_id,
          c.chunk_index,
          c.snippet,
          c.full_snippet,
          d.id::text as document_id,
          d.source_id,
          d.source_type,
          d.source_name,
          d.title,
          d.url,
          d.canonical_url,
          d.published_at,
          d.updated_at,
          d.fetched_at,
          d.last_verified_at,
          d.dedup_key,
          coalesce(sr.trust_weight, 0.72)::float as trust_score,
          greatest(
            similarity(d.title, $3),
            similarity(c.snippet, $3),
            similarity(c.full_snippet, $3)
          )::float as trigram_score,
          0::float as vector_score
        from chunks c
        join latest_versions lv on lv.version_id = c.document_version_id
        join documents d on d.id = lv.document_id
        left join source_registry sr on sr.id = d.source_id
        where d.status = 'active'
          and (
            d.title ilike any($1::text[])
            or c.snippet ilike any($1::text[])
            or c.full_snippet ilike any($1::text[])
            or d.title % $3
            or c.snippet % $3
            or c.full_snippet % $3
          )
        order by
          trigram_score desc,
          case when d.source_type = 'official' then 1 else 0 end desc,
          coalesce(sr.trust_weight, 0.72) desc,
          coalesce(d.last_verified_at, d.updated_at, d.published_at, d.fetched_at) desc nulls last
        limit $2
      `,
      [patterns, candidateLimit, trimmedQuery],
    );

    return result.rows;
  });

  if (rows.length === 0) {
    return buildEmptyResponse(trimmedQuery);
  }

  const scoredRows = rows
    .map((row) => {
      const source = buildPostgresSource(row, terms, trimmedQuery, generatedAt);

      return {
        row,
        source,
        score:
          scorePostgresSource(source, trimmedQuery, terms) +
          Math.round(Number(row.trigram_score ?? 0) * POSTGRES_SCORING.trigramWeight) +
          Math.round(Number(row.vector_score ?? 0) * POSTGRES_SCORING.vectorWeight),
      };
    })
    .filter((item) => item.score >= POSTGRES_SCORING.minimumScore)
    .sort((left, right) => right.score - left.score);

  if (scoredRows.length === 0) {
    return buildEmptyResponse(trimmedQuery);
  }

  const bestByDocument = new Map();

  for (const item of scoredRows) {
    const documentId = item.row.document_id;

    if (!bestByDocument.has(documentId)) {
      bestByDocument.set(documentId, item);
    }
  }

  const rerankedCandidates = await maybeRerankScoredItems(
    trimmedQuery,
    [...bestByDocument.values()],
    limit,
    rerankMode,
  );
  const selected = rerankedCandidates.slice(0, limit);
  const sources = selected.map((item) => item.source);
  const officialCount = sources.filter((source) => source.type === "official").length;
  const status = officialCount > 0 && sources.length >= Math.min(2, limit) ? "ok" : "partial";

  return {
    query: trimmedQuery,
    status,
    answer: buildExtractiveAnswer(trimmedQuery, sources, selected),
    sources,
    relatedQuestions: buildRelatedQuestions(trimmedQuery, sources),
    retrievedCount: scoredRows.length,
    resultGeneratedAt: generatedAt,
  };
}

function logSearchEvent(level, payload) {
  if (process.env.SEARCH_SERVICE_SILENT_LOGS === "1" && level === "info") {
    return;
  }

  const event = {
    level,
    timestamp: new Date().toISOString(),
    service: "search-service",
    ...payload,
  };
  const line = JSON.stringify(event);

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function classifyServiceError(error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (name === "SyntaxError") {
    return {
      code: "invalid_json",
      statusCode: 400,
      message: "The request body must be valid JSON.",
    };
  }

  if (
    normalizedMessage.includes("database_url") ||
    normalizedMessage.includes("econnrefused") ||
    normalizedMessage.includes("eacces")
  ) {
    return {
      code: "database_unavailable",
      statusCode: 503,
      message: "The configured Postgres database is unavailable.",
    };
  }

  if (normalizedMessage.includes("timeout") || normalizedMessage.includes("etimedout")) {
    return {
      code: "upstream_timeout",
      statusCode: 504,
      message: "The upstream search operation timed out.",
    };
  }

  return {
    code: "search_service_error",
    statusCode: 500,
    message: "The upstream search service failed to process the request.",
  };
}

async function search(query, limit) {
  const startedAt = Date.now();
  const provider = normalizeProvider(process.env.SEARCH_SERVICE_PROVIDER);
  let resolvedProvider = provider;
  let fallbackReason;
  let response;

  try {
    if (provider === "seed") {
      response = searchSeed(query, limit);
    } else if (provider === "postgres") {
      response = await searchPostgres(query, limit);
    } else if (getPostgresPool()) {
      resolvedProvider = "postgres";
      response = await searchPostgres(query, limit);
    } else {
      resolvedProvider = "seed";
      fallbackReason = "database_unconfigured";
      response = searchSeed(query, limit);
    }

    const enhancedResponse = await enhanceResponseWithLlmAnswer(response);

    logSearchEvent("info", {
      event: "search.completed",
      query,
      requestedProvider: provider,
      resolvedProvider,
      fallbackReason,
      status: enhancedResponse.status,
      sourceCount: enhancedResponse.sources.length,
      retrievedCount: enhancedResponse.retrievedCount,
      durationMs: Date.now() - startedAt,
    });

    recordSearchMetric({
      resolvedProvider,
      status: enhancedResponse.status,
      fallbackReason,
      durationMs: Date.now() - startedAt,
    });

    return enhancedResponse;
  } catch (error) {
    if (provider === "auto") {
      const classifiedError = classifyServiceError(error);
      console.error("Postgres search failed; falling back to seed corpus.", error);
      resolvedProvider = "seed";
      fallbackReason = classifiedError.code;
      response = await enhanceResponseWithLlmAnswer(searchSeed(query, limit));

      logSearchEvent("info", {
        event: "search.completed",
        query,
        requestedProvider: provider,
        resolvedProvider,
        fallbackReason,
        status: response.status,
        sourceCount: response.sources.length,
        retrievedCount: response.retrievedCount,
        durationMs: Date.now() - startedAt,
      });

      recordSearchMetric({
        resolvedProvider,
        status: response.status,
        fallbackReason,
        durationMs: Date.now() - startedAt,
      });

      return response;
    }

    const classifiedError = classifyServiceError(error);

    logSearchEvent("error", {
      event: "search.failed",
      query,
      requestedProvider: provider,
      resolvedProvider,
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorCode: classifiedError.code,
      errorMessage: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });

    recordSearchMetric({
      resolvedProvider,
      status: "error",
      errorCode: classifiedError.code,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
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
  sendJson(response, 200, await search(query, limit));
}

function createServer() {
  const port = parsePositiveInteger(process.env.PORT, DEFAULT_PORT);
  const host = process.env.HOST || DEFAULT_HOST;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (url.pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        provider: normalizeProvider(process.env.SEARCH_SERVICE_PROVIDER),
        databaseConfigured: Boolean(getPostgresPool()),
        corpusSize: seedCorpus.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === "/metrics") {
      sendJson(response, 200, getMetricsSnapshot());
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
      const classifiedError = classifyServiceError(error);
      logSearchEvent("error", {
        event: "request.failed",
        method: request.method,
        path: url.pathname,
        errorCode: classifiedError.code,
        errorType: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      sendJson(response, classifiedError.statusCode, {
        error: classifiedError.code,
        message: classifiedError.message,
      });
    }
  });
}

function startServer() {
  const port = parsePositiveInteger(process.env.PORT, DEFAULT_PORT);
  const host = process.env.HOST || DEFAULT_HOST;
  const server = createServer();

  server.listen(port, host, () => {
    console.log(`Upstream search service listening on http://${host}:${port}`);
    console.log(`Provider: ${normalizeProvider(process.env.SEARCH_SERVICE_PROVIDER)}`);
    console.log(`Health check: http://${host}:${port}/health`);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close(async () => {
        await closePostgresPool();
        process.exit(0);
      });
    });
  }

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  countSpecificTermHits,
  buildTerms,
  closePostgresPool,
  createServer,
  getGenericTitlePenalty,
  normalizeRetrievalMode,
  normalizeRerankMode,
  search,
  searchPostgres,
  searchSeed,
  scorePostgresSource,
  startServer,
};
