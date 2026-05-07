import { NextResponse } from "next/server";

import { buildErrorResponse } from "@/lib/search/normalize-response";
import { createSearchRequestId, stripSearchResponseMeta, withSearchResponseMeta } from "@/lib/search/response-meta";
import { checkSearchRateLimit, readCachedSearchResponse, writeCachedSearchResponse } from "@/lib/search/search-gateway";
import { searchServiceProvider } from "@/lib/search/search-provider";
import { createRedisKeyValueStore } from "@/lib/server/redis-store";
import { storeSearchQueryLog } from "@/lib/server/search-log-store";

export const runtime = "nodejs";

function getClientId(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "local";
}

function logSearchGatewayEvent(level: "info" | "error", payload: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    service: "next-search-gateway",
    ...payload,
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

async function storeSearchLogFailOpen(
  requestId: string,
  query: string,
  response: ReturnType<typeof withSearchResponseMeta>,
  clientId: string,
) {
  try {
    await storeSearchQueryLog({
      requestId,
      query,
      response,
      clientId,
    });
  } catch (error) {
    logSearchGatewayEvent("error", {
      event: "search.query_log_failed",
      requestId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = createSearchRequestId();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const store = createRedisKeyValueStore();
  const clientId = getClientId(request);

  try {
    const rateLimit = await checkSearchRateLimit(store, clientId);

    if (!rateLimit.allowed) {
      const response = withSearchResponseMeta(
        buildErrorResponse(query.trim(), {
          requestId,
          errorCode: "rate_limited",
        }),
        {
          requestId,
          cacheStatus: "bypass",
          durationMs: Date.now() - startedAt,
        },
      );

      await storeSearchLogFailOpen(requestId, query.trim(), response, clientId);

      return NextResponse.json(response, {
        status: 429,
        headers: {
          "x-search-request-id": requestId,
          "x-rate-limit-limit": String(rateLimit.limit),
          "x-rate-limit-count": String(rateLimit.count),
        },
      });
    }
  } catch (error) {
    logSearchGatewayEvent("error", {
      event: "search.rate_limit_failed_open",
      requestId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    let cached: Awaited<ReturnType<typeof readCachedSearchResponse>> = store
      ? {
          enabled: true,
          response: null,
        }
      : {
          enabled: false,
          response: null,
        };

    try {
      cached = await readCachedSearchResponse(store, query);
    } catch (error) {
      cached = {
        enabled: false,
        response: null,
      };
      logSearchGatewayEvent("error", {
        event: "search.cache_read_failed_open",
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    if (cached.response) {
      const response = withSearchResponseMeta(cached.response, {
        requestId,
        cacheStatus: "hit",
        durationMs: Date.now() - startedAt,
      });

      await storeSearchLogFailOpen(requestId, query, response, clientId);

      return NextResponse.json(response, {
        headers: {
          "x-search-request-id": requestId,
          "x-search-cache": "hit",
        },
      });
    }

    const response = await searchServiceProvider.search(query, { requestId });
    const cacheStatus = cached.enabled ? "miss" : "bypass";
    const responseWithMeta = withSearchResponseMeta(response, {
      requestId,
      errorCode: response.meta?.errorCode,
      cacheStatus,
      durationMs: Date.now() - startedAt,
    });

    try {
      await writeCachedSearchResponse(store, query, stripSearchResponseMeta(responseWithMeta));
    } catch (error) {
      logSearchGatewayEvent("error", {
        event: "search.cache_write_failed",
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    await storeSearchLogFailOpen(requestId, query, responseWithMeta, clientId);

    return NextResponse.json(responseWithMeta, {
      headers: {
        "x-search-request-id": requestId,
        "x-search-cache": cacheStatus,
      },
    });
  } catch (error) {
    logSearchGatewayEvent("error", {
      event: "search.gateway_failed",
      requestId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    const response = withSearchResponseMeta(
      buildErrorResponse(query.trim(), {
        requestId,
        errorCode: "search_service_error",
      }),
      {
        requestId,
        cacheStatus: store ? "miss" : "bypass",
        durationMs: Date.now() - startedAt,
      },
    );

    await storeSearchLogFailOpen(requestId, query.trim(), response, clientId);

    return NextResponse.json(response, {
      status: 500,
      headers: {
        "x-search-request-id": requestId,
      },
    });
  }
}
