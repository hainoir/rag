import crypto from "node:crypto";

import type { SearchResponse } from "./types";

export type KeyValueStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlSeconds: number) => Promise<void>;
  increment: (key: string, ttlSeconds: number) => Promise<number>;
};

export type SearchCacheRead =
  | {
      enabled: false;
      response: null;
    }
  | {
      enabled: true;
      response: SearchResponse | null;
    };

export type RateLimitResult =
  | {
      enabled: false;
      allowed: true;
      count: 0;
      limit: number;
    }
  | {
      enabled: true;
      allowed: boolean;
      count: number;
      limit: number;
    };

const DEFAULT_CACHE_TTL_SECONDS = 300;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_RATE_LIMIT_MAX = 60;

export function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function readSearchGatewayConfig(env = process.env) {
  return {
    cacheTtlSeconds: parsePositiveInteger(env.SEARCH_CACHE_TTL_SECONDS, DEFAULT_CACHE_TTL_SECONDS),
    rateLimitWindowSeconds: parsePositiveInteger(
      env.SEARCH_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
    ),
    rateLimitMax: parsePositiveInteger(env.SEARCH_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
    keyPrefix: String(env.SEARCH_CACHE_PREFIX ?? "campus-rag").trim() || "campus-rag",
  };
}

export function buildSearchCacheKey(query: string, prefix = "campus-rag") {
  const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
  const digest = crypto.createHash("sha256").update(normalized).digest("hex");

  return `${prefix}:search:${digest}`;
}

export function buildSearchRateLimitKey(clientId: string, prefix = "campus-rag") {
  const digest = crypto.createHash("sha256").update(clientId || "anonymous").digest("hex");

  return `${prefix}:rate:${digest}`;
}

function isSearchResponse(value: unknown): value is SearchResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "query" in value &&
    "status" in value &&
    "sources" in value &&
    "resultGeneratedAt" in value
  );
}

export async function readCachedSearchResponse(
  store: KeyValueStore | null,
  query: string,
  config = readSearchGatewayConfig(),
): Promise<SearchCacheRead> {
  if (!store) {
    return {
      enabled: false,
      response: null,
    };
  }

  const raw = await store.get(buildSearchCacheKey(query, config.keyPrefix));

  if (!raw) {
    return {
      enabled: true,
      response: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return {
      enabled: true,
      response: isSearchResponse(parsed) ? parsed : null,
    };
  } catch {
    return {
      enabled: true,
      response: null,
    };
  }
}

export async function writeCachedSearchResponse(
  store: KeyValueStore | null,
  query: string,
  response: SearchResponse,
  config = readSearchGatewayConfig(),
) {
  if (!store || response.status === "error") {
    return;
  }

  await store.set(buildSearchCacheKey(query, config.keyPrefix), JSON.stringify(response), config.cacheTtlSeconds);
}

export async function checkSearchRateLimit(
  store: KeyValueStore | null,
  clientId: string,
  config = readSearchGatewayConfig(),
): Promise<RateLimitResult> {
  if (!store) {
    return {
      enabled: false,
      allowed: true,
      count: 0,
      limit: config.rateLimitMax,
    };
  }

  const count = await store.increment(
    buildSearchRateLimitKey(clientId, config.keyPrefix),
    config.rateLimitWindowSeconds,
  );

  return {
    enabled: true,
    allowed: count <= config.rateLimitMax,
    count,
    limit: config.rateLimitMax,
  };
}
