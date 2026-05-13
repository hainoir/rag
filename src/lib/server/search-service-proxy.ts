import {
  buildSearchServiceRequestHeaders,
  parsePositiveInteger,
  resolveSearchServiceSiblingEndpoint,
} from "../search/search-service-config.ts";

const DEFAULT_TELEMETRY_TIMEOUT_MS = 1_500;
const DEFAULT_FEEDBACK_TIMEOUT_MS = 8_000;

function readProxyErrorMessage(response: Response, payload: unknown) {
  if (typeof payload === "object" && payload !== null) {
    if ("error" in payload && typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }

    if ("message" in payload && typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  }

  return response.statusText || `HTTP ${response.status}`;
}

async function readProxyError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return response.statusText || `HTTP ${response.status}`;
  }

  try {
    const payload = (await response.clone().json()) as unknown;
    return readProxyErrorMessage(response, payload);
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

export function readSearchServiceProxyConfig(env = process.env) {
  return {
    telemetryTimeoutMs: parsePositiveInteger(env.SEARCH_TELEMETRY_TIMEOUT_MS, DEFAULT_TELEMETRY_TIMEOUT_MS),
    feedbackTimeoutMs: parsePositiveInteger(env.SEARCH_SERVICE_TIMEOUT_MS, DEFAULT_FEEDBACK_TIMEOUT_MS),
  };
}

export async function postSearchServiceJson(pathname: string, payload: unknown, timeoutMs: number) {
  const endpoint = resolveSearchServiceSiblingEndpoint(pathname);

  if (!endpoint) {
    throw new Error("SEARCH_SERVICE_URL is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildSearchServiceRequestHeaders(process.env, "application/json"),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await readProxyError(response));
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}
