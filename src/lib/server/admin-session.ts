import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE = "campus_rag_admin";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readAdminToken(env = process.env) {
  return isNonEmptyString(env.ADMIN_DASHBOARD_TOKEN) ? env.ADMIN_DASHBOARD_TOKEN.trim() : null;
}

function signSession(expiresAt: number, token: string) {
  return crypto.createHmac("sha256", token).update(String(expiresAt)).digest("hex");
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAdminAuthConfigured(env = process.env) {
  return readAdminToken(env) !== null;
}

export function verifyAdminLoginToken(token: unknown, env = process.env) {
  const expected = readAdminToken(env);

  if (!expected || !isNonEmptyString(token)) {
    return false;
  }

  return timingSafeEqual(token.trim(), expected);
}

export function createAdminSessionValue(now = Date.now(), env = process.env) {
  const token = readAdminToken(env);

  if (!token) {
    throw new Error("ADMIN_DASHBOARD_TOKEN is not configured.");
  }

  const expiresAt = now + ADMIN_SESSION_TTL_SECONDS * 1_000;
  return `${expiresAt}.${signSession(expiresAt, token)}`;
}

export function verifyAdminSessionValue(value: unknown, now = Date.now(), env = process.env) {
  const token = readAdminToken(env);

  if (!token || !isNonEmptyString(value)) {
    return false;
  }

  const [expiresAtValue, signature] = value.split(".");
  const expiresAt = Number(expiresAtValue);

  if (!Number.isFinite(expiresAt) || expiresAt <= now || !signature) {
    return false;
  }

  return timingSafeEqual(signature, signSession(expiresAt, token));
}
