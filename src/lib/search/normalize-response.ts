import { DEFAULT_QUESTIONS } from "./default-questions.ts";
import type {
  SearchAnswer,
  SearchCacheStatus,
  SearchErrorCode,
  SearchResponse,
  SearchResponseMeta,
  SearchSource,
  SearchStatus,
  SourceFreshness,
  SourceType,
} from "./types.ts";

const DEFAULT_DISCLAIMER = "如果问题涉及时间、费用、资格或办理流程，请以来源原文和最新公告为准。";

type JsonRecord = Record<string, unknown>;

type ResponseInput = Omit<SearchResponse, "resultGeneratedAt" | "retrievedCount" | "meta"> & {
  resultGeneratedAt?: string;
  retrievedCount?: number;
  meta?: Partial<SearchResponseMeta>;
};

const ALLOWED_ERROR_CODES = new Set<SearchErrorCode>([
  "missing_search_service_url",
  "upstream_bad_request",
  "upstream_unauthorized",
  "upstream_timeout",
  "upstream_rate_limited",
  "upstream_unavailable",
  "upstream_unreachable",
  "upstream_http_error",
  "upstream_error",
  "invalid_upstream_response",
  "rate_limited",
  "search_service_error",
  "database_unavailable",
  "invalid_feedback",
  "feedback_store_unavailable",
]);

const ALLOWED_CACHE_STATUSES = new Set<SearchCacheStatus>(["hit", "miss", "bypass"]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pickFirst(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function pickString(record: JsonRecord, keys: string[]) {
  const value = pickFirst(record, keys);

  if (!isNonEmptyString(value)) {
    return undefined;
  }

  return value.trim();
}

function pickArray(record: JsonRecord, keys: string[]) {
  const value = pickFirst(record, keys);
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => isNonEmptyString(item))
    .map((item) => item.trim());
}

function clampConfidence(value: unknown, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  if (value > 1) {
    return Math.min(Math.max(value / 100, 0), 1);
  }

  return Math.min(Math.max(value, 0), 1);
}

function normalizeErrorCode(value: unknown) {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  return ALLOWED_ERROR_CODES.has(normalized as SearchErrorCode)
    ? (normalized as SearchErrorCode)
    : "search_service_error";
}

function normalizeCacheStatus(value: unknown) {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  return ALLOWED_CACHE_STATUSES.has(normalized as SearchCacheStatus)
    ? (normalized as SearchCacheStatus)
    : undefined;
}

function normalizeResponseMeta(value: unknown, fallback?: Partial<SearchResponseMeta>) {
  const record = isRecord(value) ? value : {};
  const requestId =
    pickString(record, ["requestId", "request_id", "traceId", "trace_id"]) ?? fallback?.requestId;

  if (!requestId?.trim()) {
    return undefined;
  }

  const durationValue = pickFirst(record, ["durationMs", "duration_ms", "latencyMs", "latency_ms"]);
  const durationMs =
    typeof durationValue === "number" && Number.isFinite(durationValue) && durationValue >= 0
      ? Math.round(durationValue)
      : fallback?.durationMs;
  const errorCode = normalizeErrorCode(pickFirst(record, ["errorCode", "error_code", "code"])) ?? fallback?.errorCode;
  const cacheStatus =
    normalizeCacheStatus(pickFirst(record, ["cacheStatus", "cache_status"])) ?? fallback?.cacheStatus;

  return {
    requestId: requestId.trim(),
    ...(errorCode ? { errorCode } : {}),
    ...(cacheStatus ? { cacheStatus } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  } satisfies SearchResponseMeta;
}

function normalizeTimestamp(value: unknown, fallback: string) {
  const normalized = normalizeOptionalTimestamp(value);
  return normalized ?? fallback;
}

function normalizeOptionalTimestamp(value: unknown) {
  if (typeof value === "number") {
    const normalized = new Date(value);
    return Number.isNaN(normalized.getTime()) ? undefined : normalized.toISOString();
  }

  if (isNonEmptyString(value)) {
    const normalized = new Date(value);
    return Number.isNaN(normalized.getTime()) ? undefined : normalized.toISOString();
  }

  return undefined;
}

function normalizeSourceType(value: unknown, url?: string): SourceType {
  if (isNonEmptyString(value)) {
    const normalized = value.trim().toLowerCase();

    if (["official", "authority", "admin", "notice", "announcement", "policy"].includes(normalized)) {
      return "official";
    }

    if (["community", "forum", "discussion", "ugc", "social", "student"].includes(normalized)) {
      return "community";
    }
  }

  if (url && /(\.edu|\.gov|official|university|college|school)/i.test(url)) {
    return "official";
  }

  return "community";
}

function deriveSourceDomain(url?: string) {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function deriveSourceName(sourceType: SourceType, url?: string) {
  const domain = deriveSourceDomain(url);

  if (domain) {
    return domain;
  }

  return sourceType === "official" ? "官方站点" : "社区站点";
}

function pickFreshnessReferenceTimestamp(timestamps: Array<string | null | undefined>) {
  return timestamps.find((timestamp): timestamp is string => isNonEmptyString(timestamp));
}

function normalizeFreshnessLabel(
  value: unknown,
  referenceTimestamp?: string | null,
  generatedAt?: string,
): SourceFreshness {
  if (isNonEmptyString(value)) {
    const normalized = value.trim().toLowerCase();

    if (normalized === "fresh") {
      return "fresh";
    }

    if (normalized === "recent") {
      return "recent";
    }

    if (normalized === "stale") {
      return "stale";
    }

    if (normalized === "undated") {
      return "undated";
    }
  }

  if (!isNonEmptyString(referenceTimestamp)) {
    return "undated";
  }

  const comparable = new Date(referenceTimestamp).getTime();

  if (!Number.isFinite(comparable)) {
    return "undated";
  }

  const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Date.now();

  if (!Number.isFinite(generatedAtMs)) {
    return "undated";
  }

  const ageInDays = Math.floor((generatedAtMs - comparable) / (1000 * 60 * 60 * 24));

  if (ageInDays <= 3) {
    return "fresh";
  }

  if (ageInDays <= 30) {
    return "recent";
  }

  return "stale";
}

function tokenizeQuery(query: string) {
  const tokens = query
    .split(/[\s,.;:!?，。；：！？、/]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length > 0) {
    return tokens.slice(0, 5);
  }

  return query.trim() ? [query.trim()] : [];
}

function deriveMatchedKeywords(query: string, text: string) {
  const normalizedText = text.toLowerCase();
  const tokens = tokenizeQuery(query).filter((token) => normalizedText.includes(token.toLowerCase()));

  return tokens.length > 0 ? tokens : tokenizeQuery(query);
}

function summarizeSnippet(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
}

function buildSourceNote(sources: SearchSource[]) {
  if (sources.length === 0) {
    return "当前结果未附带可展示的来源，请回到原始检索服务核对结果。";
  }

  const officialCount = sources.filter((source) => source.type === "official").length;
  const communityCount = sources.length - officialCount;

  if (officialCount > 0 && communityCount === 0) {
    return `当前结论主要基于 ${officialCount} 条官方来源整理，适合先看摘要，再回到原文逐条核对。`;
  }

  if (officialCount === 0) {
    return `当前结果主要来自 ${communityCount} 条社区来源，建议把这些内容当作经验补充，而不是最终依据。`;
  }

  return `当前结果综合了 ${officialCount} 条官方来源和 ${communityCount} 条社区来源，建议优先以官方信息为准。`;
}

function buildAnswerEvidenceFromSources(sources: SearchSource[]) {
  return sources.slice(0, 4).map((source) => ({
    sourceId: source.id,
    title: source.title,
    sourceName: source.sourceName,
    snippet: summarizeSnippet(source.snippet),
  }));
}

function buildPartialAnswer(query: string, sources: SearchSource[]): SearchAnswer {
  const leadingSnippet = summarizeSnippet(sources[0]?.snippet);

  return {
    summary: leadingSnippet
      ? `已检索到与“${query}”相关的来源，当前最直接的命中信息是：${leadingSnippet}`
      : `已检索到与“${query}”相关的来源，但上游检索服务暂未返回可直接展示的结构化回答。`,
    sourceNote: buildSourceNote(sources),
    disclaimer: DEFAULT_DISCLAIMER,
    confidence: 0.56,
    evidence: buildAnswerEvidenceFromSources(sources),
  };
}

function buildResponse({
  query,
  status,
  answer,
  relatedQuestions,
  sources,
  resultGeneratedAt,
  retrievedCount,
  meta,
}: ResponseInput): SearchResponse {
  const generatedAt = normalizeTimestamp(resultGeneratedAt, new Date().toISOString());
  const normalizedMeta = normalizeResponseMeta(meta, meta);

  return {
    query,
    status,
    answer,
    relatedQuestions: relatedQuestions.length > 0 ? relatedQuestions : DEFAULT_QUESTIONS,
    sources,
    retrievedCount: typeof retrievedCount === "number" && retrievedCount >= 0 ? retrievedCount : sources.length,
    resultGeneratedAt: generatedAt,
    ...(normalizedMeta ? { meta: normalizedMeta } : {}),
  };
}

export function buildEmptyResponse(query: string, meta?: Partial<SearchResponseMeta>) {
  return buildResponse({
    query,
    status: "empty",
    answer: null,
    sources: [],
    relatedQuestions: DEFAULT_QUESTIONS,
    meta,
  });
}

export function buildErrorResponse(query: string, meta?: Partial<SearchResponseMeta>) {
  return buildResponse({
    query,
    status: "error",
    answer: null,
    sources: [],
    relatedQuestions: DEFAULT_QUESTIONS,
    meta,
  });
}

function normalizeSource(rawSource: JsonRecord, index: number, query: string, fallbackDate: string): SearchSource {
  const url = pickString(rawSource, ["url", "link", "href"]);
  const sourceType = normalizeSourceType(
    pickFirst(rawSource, ["type", "sourceType", "origin", "channel"]),
    url,
  );
  const sourceDomain = deriveSourceDomain(url);
  const sourceName =
    pickString(rawSource, ["sourceName", "siteName", "publisher", "originName", "organization"]) ??
    deriveSourceName(sourceType, url);
  const publishedAt = normalizeOptionalTimestamp(
    pickFirst(rawSource, ["publishedAt", "published_at", "date", "createdAt"]),
  ) ?? null;
  const updatedAt = normalizeOptionalTimestamp(
    pickFirst(rawSource, ["updatedAt", "updated_at", "modifiedAt", "modified_at", "lastUpdatedAt"]),
  ) ?? null;
  const fetchedAt = normalizeTimestamp(
    pickFirst(rawSource, ["fetchedAt", "fetched_at", "crawledAt", "crawled_at", "indexedAt", "indexed_at"]),
    fallbackDate,
  );
  const lastVerifiedAt = normalizeOptionalTimestamp(
    pickFirst(rawSource, ["lastVerifiedAt", "last_verified_at", "verifiedAt", "validatedAt", "checkedAt"]),
  ) ?? null;
  const title =
    pickString(rawSource, ["title", "name", "sourceTitle", "documentTitle"]) ?? `检索结果 ${index + 1}`;
  const snippet =
    pickString(rawSource, ["snippet", "excerpt", "summary", "content", "text", "chunk", "body"]) ?? title;
  const fullSnippet =
    pickString(rawSource, ["fullSnippet", "fullText", "rawText", "content", "text", "body"]) ?? snippet;
  const providedKeywords = toStringArray(
    pickFirst(rawSource, ["matchedKeywords", "keywords", "matched_terms", "highlights"]),
  );
  const matchedKeywords = providedKeywords.length > 0
    ? providedKeywords.slice(0, 5)
    : deriveMatchedKeywords(query, `${title} ${fullSnippet}`);
  const trustScore = pickFirst(rawSource, ["trustScore", "trust_score", "authorityScore", "sourceScore"]);
  const canonicalUrl = pickString(rawSource, ["canonicalUrl", "canonical_url"]) ?? url;

  return {
    id:
      pickString(rawSource, ["id", "documentId", "sourceId", "chunkId"]) ??
      url ??
      `source-${index + 1}`,
    title,
    type: sourceType,
    sourceName,
    sourceDomain,
    publishedAt,
    updatedAt,
    fetchedAt,
    lastVerifiedAt,
    snippet,
    fullSnippet,
    matchedKeywords,
    url,
    canonicalUrl,
    freshnessLabel: normalizeFreshnessLabel(
      pickFirst(rawSource, ["freshnessLabel", "freshness", "recency", "freshness_label"]),
      pickFreshnessReferenceTimestamp([lastVerifiedAt, updatedAt, publishedAt, fetchedAt]),
      fallbackDate,
    ),
    trustScore:
      typeof trustScore === "number"
        ? clampConfidence(trustScore, sourceType === "official" ? 0.92 : 0.72)
        : undefined,
    dedupKey: pickString(rawSource, ["dedupKey", "dedupeKey", "contentFingerprint", "documentFingerprint"]),
  };
}

function normalizeAnswer(value: unknown, sources: SearchSource[]): SearchAnswer | null {
  const fallbackConfidence = sources.length > 0 ? 0.74 : 0.58;
  const fallbackEvidence = buildAnswerEvidenceFromSources(sources);

  if (isNonEmptyString(value)) {
    return {
      summary: value.trim(),
      sourceNote: buildSourceNote(sources),
      disclaimer: DEFAULT_DISCLAIMER,
      confidence: fallbackConfidence,
      evidence: fallbackEvidence,
    } satisfies SearchAnswer;
  }

  if (!isRecord(value)) {
    return null;
  }

  const summary = pickString(value, ["summary", "text", "answer"]);

  if (!summary) {
    return null;
  }

  const rawEvidence = pickFirst(value, ["evidence", "citations", "sourceEvidence"]);
  const evidence = normalizeAnswerEvidence(rawEvidence, fallbackEvidence);

  return {
    summary,
    sourceNote: pickString(value, ["sourceNote", "sourcesSummary", "evidenceNote"]) ?? buildSourceNote(sources),
    disclaimer: pickString(value, ["disclaimer", "warning", "note"]) ?? DEFAULT_DISCLAIMER,
    confidence: clampConfidence(pickFirst(value, ["confidence", "score"]), fallbackConfidence),
    evidence,
  } satisfies SearchAnswer;
}

function normalizeAnswerEvidence(value: unknown, fallback: ReturnType<typeof buildAnswerEvidenceFromSources>) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .filter(isRecord)
    .map((item) => {
      const sourceId = pickString(item, ["sourceId", "source_id", "id", "chunkId", "chunk_id"]);
      const title = pickString(item, ["title", "sourceTitle", "documentTitle"]);

      if (!sourceId || !title) {
        return null;
      }

      return {
        sourceId,
        title,
        sourceName: pickString(item, ["sourceName", "source_name", "siteName"]),
        snippet: pickString(item, ["snippet", "excerpt"]),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return normalized.length > 0 ? normalized.slice(0, 4) : fallback;
}

function normalizeStatus(value: unknown, sources: SearchSource[], answer: SearchAnswer | null): SearchStatus {
  if (isNonEmptyString(value)) {
    const normalized = value.trim().toLowerCase();

    if (normalized === "ok" || normalized === "partial" || normalized === "empty" || normalized === "error") {
      return normalized;
    }
  }

  if (sources.length === 0) {
    return "empty";
  }

  return answer ? "ok" : "partial";
}

function unwrapPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  if (isRecord(payload.data)) {
    return payload.data;
  }

  return payload;
}

export function normalizeUpstreamResponse(
  query: string,
  payload: unknown,
  fallbackMeta?: Partial<SearchResponseMeta>,
) {
  const body = unwrapPayload(payload);

  if (!body) {
    return buildErrorResponse(query, {
      ...fallbackMeta,
      errorCode: fallbackMeta?.errorCode ?? "invalid_upstream_response",
    });
  }

  const meta = normalizeResponseMeta(pickFirst(body, ["meta", "_meta"]), {
    ...fallbackMeta,
    errorCode: normalizeErrorCode(pickFirst(body, ["errorCode", "error_code", "code"])) ?? fallbackMeta?.errorCode,
  });
  const generatedAt = normalizeTimestamp(
    pickFirst(body, ["resultGeneratedAt", "generatedAt", "timestamp"]),
    new Date().toISOString(),
  );
  const sources = pickArray(body, ["sources", "results", "items", "documents", "matches"])
    .filter(isRecord)
    .map((source, index) => normalizeSource(source, index, query, generatedAt));
  const answerValue =
    pickFirst(body, ["answer"]) ??
    (pickString(body, ["summary"]) || "sourceNote" in body || "disclaimer" in body || "confidence" in body
      ? body
      : null);
  let answer = normalizeAnswer(answerValue, sources);
  let status = normalizeStatus(pickFirst(body, ["status", "state"]), sources, answer);

  if (status === "error") {
    return buildErrorResponse(query, meta);
  }

  if (status === "empty" || sources.length === 0) {
    return buildEmptyResponse(query, meta);
  }

  if (!answer) {
    answer = buildPartialAnswer(query, sources);
    status = "partial";
  }

  return buildResponse({
    query: pickString(body, ["query"]) ?? query,
    status,
    answer,
    sources,
    relatedQuestions: toStringArray(
      pickFirst(body, ["relatedQuestions", "suggestions", "followUpQuestions"]),
    ),
    retrievedCount:
      typeof pickFirst(body, ["retrievedCount", "total", "totalHits"]) === "number"
        ? (pickFirst(body, ["retrievedCount", "total", "totalHits"]) as number)
        : sources.length,
    resultGeneratedAt: generatedAt,
    meta,
  });
}
