function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function getConfiguredSearchServiceUrl(env = process.env) {
  const endpoint = env.SEARCH_SERVICE_URL;

  return isNonEmptyString(endpoint) ? endpoint.trim() : null;
}

export function resolveSearchServiceSiblingEndpoint(pathname: string, env = process.env) {
  const endpoint = getConfiguredSearchServiceUrl(env);

  if (!endpoint) {
    return null;
  }

  const url = new URL(endpoint);
  const pathUrl = new URL(pathname.startsWith("/") ? `http://local${pathname}` : `http://local/${pathname}`);
  url.pathname = pathUrl.pathname;
  url.search = pathUrl.search;
  url.hash = "";

  return url.toString();
}

export function buildSearchServiceRequestHeaders(env = process.env, contentType?: string) {
  const headers = new Headers({
    Accept: "application/json",
  });
  const apiKey = env.SEARCH_SERVICE_API_KEY;
  const authHeader = env.SEARCH_SERVICE_AUTH_HEADER ?? "Authorization";

  if (isNonEmptyString(apiKey)) {
    headers.set(
      authHeader,
      authHeader.toLowerCase() === "authorization" && !apiKey.trim().startsWith("Bearer ")
        ? `Bearer ${apiKey.trim()}`
        : apiKey.trim(),
    );
  }

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  return headers;
}
