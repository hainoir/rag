import "server-only";

import type { NoticeDocument, NoticeFetchResponse, SearchErrorCode, SearchProvider, SearchProviderOptions } from "@/lib/search/types";
import {
  buildSearchServiceRequestHeaders,
  getConfiguredSearchServiceUrl,
  parsePositiveInteger,
  resolveSearchServiceSiblingEndpoint,
} from "@/lib/search/search-service-config";
import {
  buildEmptyResponse,
  buildErrorResponse,
  normalizeUpstreamResponse,
} from "@/lib/search/normalize-response";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_LIMIT = 6;

function logSearchProviderEvent(level: "info" | "error", payload: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    service: "next-search-provider",
    ...payload,
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function classifySearchProviderError(error: unknown): SearchErrorCode {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "upstream_timeout";
  }

  if (error instanceof Error && /fetch|network|econnrefused|failed/i.test(error.message)) {
    return "upstream_unreachable";
  }

  return "upstream_error";
}

function classifyHttpStatus(status: number): SearchErrorCode {
  if (status === 400) {
    return "upstream_bad_request";
  }

  if (status === 401 || status === 403) {
    return "upstream_unauthorized";
  }

  if (status === 408 || status === 504) {
    return "upstream_timeout";
  }

  if (status === 429) {
    return "upstream_rate_limited";
  }

  if (status === 503) {
    return "upstream_unavailable";
  }

  return "upstream_http_error";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseNoticeDocument(value: unknown, expectedId: string): NoticeDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const nullableDate = (key: string) => row[key] === null || (typeof row[key] === "string" && !Number.isNaN(Date.parse(row[key])));
  const optionalString = (key: string) => row[key] === undefined || row[key] === null || typeof row[key] === "string";
  if (
    row.documentId !== expectedId ||
    !Number.isInteger(row.versionNo) || Number(row.versionNo) < 1 ||
    !isNonEmptyString(row.title) ||
    (row.type !== "official" && row.type !== "community") ||
    !isNonEmptyString(row.sourceName) ||
    !optionalString("sourceDomain") || !optionalString("url") || !optionalString("canonicalUrl") ||
    !nullableDate("publishedAt") || !nullableDate("updatedAt") ||
    !isNonEmptyString(row.fetchedAt) || Number.isNaN(Date.parse(row.fetchedAt)) ||
    !nullableDate("lastVerifiedAt") ||
    (row.governanceStatus !== undefined && !["approved", "supplemental", "pending", "rejected"].includes(String(row.governanceStatus))) ||
    typeof row.answerEligible !== "boolean" || typeof row.body !== "string" ||
    typeof row.truncated !== "boolean" ||
    !Number.isInteger(row.bodyCharCount) || Number(row.bodyCharCount) < 0 ||
    !Number.isInteger(row.returnedCharCount) || Number(row.returnedCharCount) < 0 ||
    Number(row.returnedCharCount) !== row.body.length || Number(row.bodyCharCount) < row.body.length
  ) return null;
  return {
    documentId: row.documentId as string,
    versionNo: row.versionNo as number,
    title: row.title as string,
    type: row.type as NoticeDocument["type"],
    sourceName: row.sourceName as string,
    ...(typeof row.sourceDomain === "string" ? { sourceDomain: row.sourceDomain } : {}),
    ...(typeof row.url === "string" ? { url: row.url } : {}),
    ...(typeof row.canonicalUrl === "string" ? { canonicalUrl: row.canonicalUrl } : {}),
    publishedAt: row.publishedAt as string | null,
    updatedAt: row.updatedAt as string | null,
    fetchedAt: row.fetchedAt as string,
    lastVerifiedAt: row.lastVerifiedAt as string | null,
    ...(row.governanceStatus ? { governanceStatus: row.governanceStatus as NoticeDocument["governanceStatus"] } : {}),
    answerEligible: row.answerEligible as boolean,
    body: row.body,
    truncated: row.truncated as boolean,
    bodyCharCount: row.bodyCharCount as number,
    returnedCharCount: row.returnedCharCount as number,
  };
}

async function callNoticeService(documentId: string, options: SearchProviderOptions = {}): Promise<NoticeFetchResponse> {
  const id = typeof documentId === "string" ? documentId.trim() : "";
  const failure = (status: NoticeFetchResponse["status"], errorCode?: SearchErrorCode): NoticeFetchResponse => ({
    status, document: null,
    ...(errorCode ? { meta: { requestId: options.requestId ?? "", errorCode } } : {}),
  });
  if (!id || id.length > 128) return failure("invalid");
  let endpoint: string | null;
  try {
    endpoint = resolveSearchServiceSiblingEndpoint(`/api/documents/${encodeURIComponent(id)}`);
  } catch {
    endpoint = null;
  }
  if (!endpoint) return failure("error", "missing_search_service_url");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), parsePositiveInteger(process.env.SEARCH_SERVICE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS));
  try {
    const response = await fetch(endpoint, { method: "GET", headers: buildSearchServiceRequestHeaders(), cache: "no-store", signal: controller.signal });
    const status = response.status === 400 ? "invalid" : response.status === 404 ? "not_found" : "error";
    if (!response.ok) {
      const errorCode = classifyHttpStatus(response.status);
      logSearchProviderEvent("error", { event: "notice.fetch", requestId: options.requestId, documentId: id, status, httpStatus: response.status, errorCode });
      return failure(status, errorCode);
    }
    const document = parseNoticeDocument(await response.json() as unknown, id);
    if (!document) {
      logSearchProviderEvent("error", { event: "notice.fetch", requestId: options.requestId, documentId: id, status: "error", errorCode: "invalid_upstream_response" });
      return failure("error", "invalid_upstream_response");
    }
    logSearchProviderEvent("info", { event: "notice.fetch", requestId: options.requestId, documentId: id, status: "ok", truncated: document.truncated, bodyCharCount: document.bodyCharCount, returnedCharCount: document.returnedCharCount });
    return { status: "ok", document };
  } catch (error) {
    const errorCode = classifySearchProviderError(error);
    logSearchProviderEvent("error", { event: "notice.fetch", requestId: options.requestId, documentId: id, status: "error", errorCode });
    return failure("error", errorCode);
  } finally {
    clearTimeout(timeout);
  }
}

function buildSearchServiceRequest(query: string) {
  const endpoint = getConfiguredSearchServiceUrl();

  if (!isNonEmptyString(endpoint)) {
    return null;
  }

  const method = (process.env.SEARCH_SERVICE_METHOD ?? "POST").trim().toUpperCase();
  const limit = parsePositiveInteger(process.env.SEARCH_SERVICE_LIMIT, DEFAULT_LIMIT);
  const headers = buildSearchServiceRequestHeaders();

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

  return {
    url: endpoint,
    init: {
      method: "POST",
      headers: buildSearchServiceRequestHeaders(process.env, "application/json"),
      body: JSON.stringify({
        query,
        limit,
      }),
      cache: "no-store" as const,
    },
  };
}

async function readUpstreamErrorCode(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const payload = (await response.clone().json()) as unknown;

    if (typeof payload === "object" && payload !== null && "error" in payload) {
      const value = (payload as { error?: unknown }).error;

      return typeof value === "string" && value.trim() ? value.trim() : null;
    }

    if (typeof payload === "object" && payload !== null && "errorCode" in payload) {
      const value = (payload as { errorCode?: unknown }).errorCode;

      return typeof value === "string" && value.trim() ? value.trim() : null;
    }
  } catch {
    return null;
  }

  return null;
}

async function callSearchService(query: string, options: SearchProviderOptions = {}) {
  const request = buildSearchServiceRequest(query);

  if (!request) {
    console.error("SEARCH_SERVICE_URL is not configured.");
    return buildErrorResponse(query, {
      requestId: options.requestId,
      errorCode: "missing_search_service_url",
    });
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
      const upstreamErrorCode = await readUpstreamErrorCode(response);
      const errorCode = upstreamErrorCode ?? classifyHttpStatus(response.status);

      logSearchProviderEvent("error", {
        event: "search.upstream_failed",
        errorCode,
        status: response.status,
        statusText: response.statusText,
      });
      return buildErrorResponse(query, {
        requestId: options.requestId,
        errorCode: errorCode as SearchErrorCode,
      });
    }

    const payload = (await response.json()) as unknown;
    return normalizeUpstreamResponse(query, payload, {
      requestId: options.requestId,
    });
  } catch (error) {
    const errorCode = classifySearchProviderError(error);

    logSearchProviderEvent("error", {
      event: "search.upstream_failed",
      errorCode,
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return buildErrorResponse(query, {
      requestId: options.requestId,
      errorCode,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const searchServiceProvider: SearchProvider = {
  async search(query: string, options?: SearchProviderOptions) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return buildEmptyResponse("", {
        requestId: options?.requestId,
      });
    }

    return callSearchService(trimmedQuery, options);
  },
  fetchNotice: callNoticeService,
};
