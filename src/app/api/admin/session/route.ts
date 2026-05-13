import { NextResponse } from "next/server";

import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isAdminAuthConfigured,
  readAdminSession,
} from "@/lib/server/admin-auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    configured: isAdminAuthConfigured(),
    authenticated: await readAdminSession(),
  });
}

export async function POST(request: Request) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "admin_auth_unconfigured",
      },
      { status: 503 },
    );
  }

  const payload = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const authenticated = await createAdminSessionCookie(payload?.token);

  if (!authenticated) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_admin_token",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
  });
}

export async function DELETE() {
  await clearAdminSessionCookie();

  return NextResponse.json({
    ok: true,
  });
}
