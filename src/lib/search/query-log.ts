import type { SearchCacheStatus, SearchErrorCode, SearchResponse, SearchStatus } from "./types.ts";

export type SearchQueryLogGatewayEvent = "search_response" | "rate_limited" | "gateway_error";

export type SearchQueryLogPayload = {
  requestId: string;
  query: string;
  status: SearchStatus;
  retrievedCount: number;
  sourceCount: number;
  officialSourceCount: number;
  communitySourceCount: number;
  cacheStatus: SearchCacheStatus;
  errorCode?: SearchErrorCode;
  durationMs?: number;
  clientId?: string;
  gatewayEvent: SearchQueryLogGatewayEvent;
  sourceIds: string[];
  sourceSnapshot?: SearchQueryLogSourceSnapshot[];
  answerSummary?: string;
  answerConfidence?: number;
  resultGeneratedAt?: string;
};

export type SearchQueryLogSourceSnapshot = {
  id: string;
  title: string;
  type: "official" | "community";
  sourceName: string;
  url?: string;
  canonicalUrl?: string;
  trustScore?: number;
  governanceStatus?: string;
  answerEligible?: boolean;
};

type ParseSearchQueryLogResult =
  | {
      ok: true;
      payload: SearchQueryLogPayload;
    }
  | {
      ok: false;
      error: string;
    };

const ALLOWED_STATUSES = new Set<SearchStatus>(["ok", "partial", "empty", "error"]);
const ALLOWED_CACHE_STATUSES = new Set<SearchCacheStatus>(["hit", "miss", "bypass"]);
const ALLOWED_GATEWAY_EVENTS = new Set<SearchQueryLogGatewayEvent>([
  "search_response",
  "rate_limited",
  "gateway_error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
}

function countSources(response: SearchResponse) {
  return response.sources.reduce(
    (counts, source) => {
      if (source.type === "official") {
        counts.official += 1;
      }

      if (source.type === "community") {
        counts.community += 1;
      }

      return counts;
    },
    {
      official: 0,
      community: 0,
    },
  );
}

function buildSourceSnapshot(response: SearchResponse): SearchQueryLogSourceSnapshot[] {
  return response.sources.slice(0, 10).map((source) => ({
    id: source.id,
    title: source.title,
    type: source.type,
    sourceName: source.sourceName,
    ...(source.url ? { url: source.url } : {}),
    ...(source.canonicalUrl ? { canonicalUrl: source.canonicalUrl } : {}),
    ...(typeof source.trustScore === "number" ? { trustScore: source.trustScore } : {}),
    ...(source.governanceStatus ? { governanceStatus: source.governanceStatus } : {}),
    ...(typeof source.answerEligible === "boolean" ? { answerEligible: source.answerEligible } : {}),
  }));
}

export function buildSearchQueryLogPayload({
  requestId,
  query,
  response,
  clientId,
  gatewayEvent,
}: {
  requestId: string;
  query: string;
  response: SearchResponse;
  clientId?: string;
  gatewayEvent: SearchQueryLogGatewayEvent;
}): SearchQueryLogPayload {
  const sourceCounts = countSources(response);

  return {
    requestId,
    query: query.trim(),
    status: response.status,
    retrievedCount: response.retrievedCount,
    sourceCount: response.sources.length,
    officialSourceCount: sourceCounts.official,
    communitySourceCount: sourceCounts.community,
    cacheStatus: response.meta?.cacheStatus ?? "bypass",
    ...(response.meta?.errorCode ? { errorCode: response.meta.errorCode } : {}),
    ...(response.meta?.durationMs !== undefined ? { durationMs: response.meta.durationMs } : {}),
    ...(clientId?.trim() ? { clientId: clientId.trim() } : {}),
    gatewayEvent,
    sourceIds: response.sources.map((source) => source.id).slice(0, 20),
    sourceSnapshot: buildSourceSnapshot(response),
    ...(response.answer?.summary ? { answerSummary: response.answer.summary.slice(0, 1_000) } : {}),
    ...(typeof response.answer?.confidence === "number" ? { answerConfidence: response.answer.confidence } : {}),
    resultGeneratedAt: response.resultGeneratedAt,
  };
}

export function parseSearchQueryLogPayload(value: unknown): ParseSearchQueryLogResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Payload must be an object.",
    };
  }

  const requestId = isNonEmptyString(value.requestId) ? value.requestId.trim() : "";
  const query = isNonEmptyString(value.query) ? value.query.trim() : "";
  const status = isNonEmptyString(value.status) ? value.status.trim().toLowerCase() : "";
  const cacheStatus = isNonEmptyString(value.cacheStatus) ? value.cacheStatus.trim().toLowerCase() : "";
  const gatewayEvent = isNonEmptyString(value.gatewayEvent) ? value.gatewayEvent.trim().toLowerCase() : "";
  const retrievedCount = toNonNegativeInteger(value.retrievedCount);
  const sourceCount = toNonNegativeInteger(value.sourceCount);
  const officialSourceCount = toNonNegativeInteger(value.officialSourceCount);
  const communitySourceCount = toNonNegativeInteger(value.communitySourceCount);

  if (!requestId) {
    return {
      ok: false,
      error: "requestId is required.",
    };
  }

  if (!query) {
    return {
      ok: false,
      error: "query is required.",
    };
  }

  if (!ALLOWED_STATUSES.has(status as SearchStatus)) {
    return {
      ok: false,
      error: "status must be one of ok, partial, empty, error.",
    };
  }

  if (!ALLOWED_CACHE_STATUSES.has(cacheStatus as SearchCacheStatus)) {
    return {
      ok: false,
      error: "cacheStatus must be one of hit, miss, bypass.",
    };
  }

  if (!ALLOWED_GATEWAY_EVENTS.has(gatewayEvent as SearchQueryLogGatewayEvent)) {
    return {
      ok: false,
      error: "gatewayEvent must be one of search_response, rate_limited, gateway_error.",
    };
  }

  if (
    retrievedCount === null ||
    sourceCount === null ||
    officialSourceCount === null ||
    communitySourceCount === null
  ) {
    return {
      ok: false,
      error: "retrievedCount, sourceCount, officialSourceCount, and communitySourceCount must be integers >= 0.",
    };
  }

  if (officialSourceCount + communitySourceCount > sourceCount) {
    return {
      ok: false,
      error: "officialSourceCount and communitySourceCount cannot exceed sourceCount.",
    };
  }

  const errorCode = isNonEmptyString(value.errorCode) ? value.errorCode.trim() : undefined;
  const durationMs = value.durationMs === undefined ? undefined : toNonNegativeInteger(value.durationMs);
  const sourceIds = Array.isArray(value.sourceIds)
    ? value.sourceIds.filter(isNonEmptyString).map((item) => item.trim()).slice(0, 20)
    : [];
  const sourceSnapshot = Array.isArray(value.sourceSnapshot)
    ? (value.sourceSnapshot.filter(isRecord).slice(0, 10) as SearchQueryLogSourceSnapshot[])
    : undefined;
  const answerSummary = isNonEmptyString(value.answerSummary) ? value.answerSummary.trim().slice(0, 1_000) : undefined;
  const answerConfidence = typeof value.answerConfidence === "number" ? value.answerConfidence : undefined;
  const resultGeneratedAt = isNonEmptyString(value.resultGeneratedAt) ? value.resultGeneratedAt.trim() : undefined;

  if (value.durationMs !== undefined && durationMs === null) {
    return {
      ok: false,
      error: "durationMs must be an integer >= 0 when provided.",
    };
  }

  if (answerConfidence !== undefined && (!Number.isFinite(answerConfidence) || answerConfidence < 0 || answerConfidence > 1)) {
    return {
      ok: false,
      error: "answerConfidence must be between 0 and 1 when provided.",
    };
  }

  const normalizedDurationMs = durationMs === null ? undefined : durationMs;
  const clientId = isNonEmptyString(value.clientId) ? value.clientId.trim() : undefined;

  return {
    ok: true,
    payload: {
      requestId,
      query,
      status: status as SearchStatus,
      retrievedCount,
      sourceCount,
      officialSourceCount,
      communitySourceCount,
      cacheStatus: cacheStatus as SearchCacheStatus,
      ...(errorCode ? { errorCode: errorCode as SearchErrorCode } : {}),
      ...(normalizedDurationMs !== undefined ? { durationMs: normalizedDurationMs } : {}),
      ...(clientId ? { clientId } : {}),
      gatewayEvent: gatewayEvent as SearchQueryLogGatewayEvent,
      sourceIds,
      ...(sourceSnapshot ? { sourceSnapshot } : {}),
      ...(answerSummary ? { answerSummary } : {}),
      ...(answerConfidence !== undefined ? { answerConfidence } : {}),
      ...(resultGeneratedAt ? { resultGeneratedAt } : {}),
    },
  };
}
