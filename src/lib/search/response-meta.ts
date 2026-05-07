import crypto from "node:crypto";

import type { SearchResponse, SearchResponseMeta } from "./types";

export function createSearchRequestId() {
  return crypto.randomUUID();
}

function cleanMeta(meta: Partial<SearchResponseMeta>) {
  if (!meta.requestId?.trim()) {
    return null;
  }

  const cleaned: SearchResponseMeta = {
    requestId: meta.requestId.trim(),
  };

  if (meta.errorCode) {
    cleaned.errorCode = meta.errorCode;
  }

  if (meta.cacheStatus) {
    cleaned.cacheStatus = meta.cacheStatus;
  }

  if (typeof meta.durationMs === "number" && Number.isFinite(meta.durationMs) && meta.durationMs >= 0) {
    cleaned.durationMs = Math.round(meta.durationMs);
  }

  return cleaned;
}

export function withSearchResponseMeta(response: SearchResponse, meta: Partial<SearchResponseMeta>) {
  const merged = cleanMeta({
    ...response.meta,
    ...meta,
  });

  if (!merged) {
    return response;
  }

  return {
    ...response,
    meta: merged,
  } satisfies SearchResponse;
}

export function stripSearchResponseMeta(response: SearchResponse) {
  const { meta: _meta, ...cacheable } = response;
  return cacheable;
}
