import "server-only";

import type { SearchProvider } from "@/lib/search/types";
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

function classifySearchProviderError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "upstream_timeout";
  }

  if (error instanceof Error && /fetch|network|econnrefused|failed/i.test(error.message)) {
    return "upstream_unreachable";
  }

  return "upstream_error";
}

function classifyHttpStatus(status: number) {
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

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
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
      logSearchProviderEvent("error", {
        event: "search.upstream_failed",
        errorCode: classifyHttpStatus(response.status),
        status: response.status,
        statusText: response.statusText,
      });
      return buildErrorResponse(query);
    }

    const payload = (await response.json()) as unknown;
    return normalizeUpstreamResponse(query, payload);
  } catch (error) {
    logSearchProviderEvent("error", {
      event: "search.upstream_failed",
      errorCode: classifySearchProviderError(error),
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
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
