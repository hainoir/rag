import { NextResponse } from "next/server";

import {
  buildSearchServiceRequestHeaders,
  parsePositiveInteger,
  resolveSearchServiceSiblingEndpoint,
} from "@/lib/search/search-service-config";
import { readAdminSession } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

type AdminProxyContext = {
  params: Promise<{
    path?: string[];
  }>;
};

function readAdminTimeoutMs() {
  return parsePositiveInteger(process.env.SEARCH_ADMIN_TIMEOUT_MS, 8_000);
}

async function proxyAdminRequest(request: Request, context: AdminProxyContext) {
  if (!(await readAdminSession())) {
    return NextResponse.json(
      {
        ok: false,
        error: "admin_session_required",
      },
      { status: 401 },
    );
  }

  const params = await context.params;
  const path = params.path?.map((part) => encodeURIComponent(part)).join("/") ?? "";
  const incomingUrl = new URL(request.url);
  const endpoint = resolveSearchServiceSiblingEndpoint(`/api/admin/${path}${incomingUrl.search}`);

  if (!endpoint) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_search_service_url",
      },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readAdminTimeoutMs());
  const method = request.method.toUpperCase();

  try {
    const response = await fetch(endpoint, {
      method,
      headers: buildSearchServiceRequestHeaders(process.env, method === "GET" ? undefined : "application/json"),
      body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "application/json; charset=utf-8";
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "admin_proxy_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function GET(request: Request, context: AdminProxyContext) {
  return proxyAdminRequest(request, context);
}

export function POST(request: Request, context: AdminProxyContext) {
  return proxyAdminRequest(request, context);
}

export function PATCH(request: Request, context: AdminProxyContext) {
  return proxyAdminRequest(request, context);
}
