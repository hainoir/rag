import { cookies } from "next/headers";

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionValue,
  isAdminAuthConfigured,
  verifyAdminLoginToken,
  verifyAdminSessionValue,
} from "./admin-session.ts";

export async function readAdminSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  return verifyAdminSessionValue(value);
}

export async function createAdminSessionCookie(token: unknown) {
  if (!verifyAdminLoginToken(token)) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, createAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    path: "/",
  });

  return true;
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export { isAdminAuthConfigured };
