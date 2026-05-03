import "server-only";

import { DEFAULT_QUESTIONS } from "@/lib/search/default-questions";
import type {
  SearchAnswer,
  SearchProvider,
  SearchResponse,
  SearchSource,
  SearchStatus,
  SourceFreshness,
  SourceType,
} from "@/lib/search/types";

const DEFAULT_DISCLAIMER = "如果问题涉及时间、费用、资格或办理流程，请以来源原文和最新公告为准。";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_LIMIT = 6;

type JsonRecord = Record<string, unknown>;

type ResponseInput = Omit<SearchResponse, "resultGeneratedAt" | "retrievedCount"> & {
  resultGeneratedAt?: string;
  retrievedCount?: number;
};

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

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
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

function buildAnswerEvidenceFromSources(sources: SearchSource[]) {
  return sources.slice(0, 4).map((source) => ({
    sourceId: source.id,
    title: source.title,
    sourceName: source.sourceName,
    snippet: summarizeSnippet(source.snippet),
  }));
}

function buildResponse({
  query,
  status,
  answer,
  relatedQuestions,
  sources,
  resultGeneratedAt,
  retrievedCount,
}: ResponseInput): SearchResponse {
  const generatedAt = normalizeTimestamp(resultGeneratedAt, new Date().toISOString());

  return {
    query,
    status,
    answer,
    relatedQuestions: relatedQuestions.length > 0 ? relatedQuestions : DEFAULT_QUESTIONS,
    sources,
    retrievedCount: typeof retrievedCount === "number" && retrievedCount >= 0 ? retrievedCount : sources.length,
    resultGeneratedAt: generatedAt,
  };
}

function buildEmptyResponse(query: string) {
  return buildResponse({
    query,
    status: "empty",
    answer: null,
    sources: [],
    relatedQuestions: DEFAULT_QUESTIONS,
  });
}

function buildErrorResponse(query: string) {
  return buildResponse({
    query,
    status: "error",
    answer: null,
    sources: [],
    relatedQuestions: DEFAULT_QUESTIONS,
  });
}

function normalizeSource(rawSource: JsonRecord, index: number, query: string, fallbackDate: string): SearchSource {
  const url = pickString(rawSource, ["url", "link", "href"]);
  const sourceType = normalizeSourceType(
    pickFirst(rawSource, ["type", "sourceType", "origin", "channel"]),
    url,
  );
  const sourceDomain = deriveSourceDomain(url);
  // The canonical upstream contract is camelCase. Legacy aliases remain here only as migration fallbacks.
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

function normalizeUpstreamResponse(query: string, payload: unknown) {
  const body = unwrapPayload(payload);

  if (!body) {
    return buildErrorResponse(query);
  }

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
    return buildErrorResponse(query);
  }

  if (status === "empty" || sources.length === 0) {
    return buildEmptyResponse(query);
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
  });
}

function buildRequestHeaders() {
  const headers = new Headers({
    Accept: "application/json",
  });
  const apiKey = process.env.SEARCH_SERVICE_API_KEY;
  const authHeader = process.env.SEARCH_SERVICE_AUTH_HEADER ?? "Authorization";

  if (isNonEmptyString(apiKey)) {
    headers.set(
      authHeader,
      authHeader.toLowerCase() === "authorization" && !apiKey.trim().startsWith("Bearer ")
        ? `Bearer ${apiKey.trim()}`
        : apiKey.trim(),
    );
  }

  return headers;
}

function buildSearchServiceRequest(query: string) {
  const endpoint = process.env.SEARCH_SERVICE_URL;

  if (!isNonEmptyString(endpoint)) {
    return null;
  }

  const method = (process.env.SEARCH_SERVICE_METHOD ?? "POST").trim().toUpperCase();
  const limit = parsePositiveInteger(process.env.SEARCH_SERVICE_LIMIT, DEFAULT_LIMIT);
  const headers = buildRequestHeaders();

  if (method === "GET") {
    const url = new URL(endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));

    return {
      url: url.toString(),
      init: {
        method: "GET",
        headers,
        cache: "no-store" as const,
      },
    };
  }

  headers.set("Content-Type", "application/json");

  return {
    url: endpoint,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        limit,
      }),
      cache: "no-store" as const,
    },
  };
}

async function callSearchService(query: string) {
  const request = buildSearchServiceRequest(query);

  if (!request) {
    console.error("SEARCH_SERVICE_URL is not configured.");
    return buildErrorResponse(query);
  }

  const timeoutMs = parsePositiveInteger(process.env.SEARCH_SERVICE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(request.url, {
      ...request.init,
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("Search service returned a non-OK status.", response.status, response.statusText);
      return buildErrorResponse(query);
    }

    const payload = (await response.json()) as unknown;
    return normalizeUpstreamResponse(query, payload);
  } catch (error) {
    console.error("Failed to call search service.", error);
    return buildErrorResponse(query);
  } finally {
    clearTimeout(timeout);
  }
}

export const searchServiceProvider: SearchProvider = {
  async search(query: string) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return buildEmptyResponse("");
    }

    return callSearchService(trimmedQuery);
  },
};
