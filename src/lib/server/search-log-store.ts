import "server-only";

import type { SearchQueryLogPayload } from "@/lib/search/query-log";

import { postSearchServiceJson, readSearchServiceProxyConfig } from "./search-service-proxy";

export async function storeSearchQueryLog(payload: SearchQueryLogPayload) {
  const { telemetryTimeoutMs } = readSearchServiceProxyConfig();

  await postSearchServiceJson("/api/query-logs", payload, telemetryTimeoutMs);

  return {
    stored: true,
  };
}
