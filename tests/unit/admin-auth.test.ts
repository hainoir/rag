import assert from "node:assert/strict";

import {
  createAdminSessionValue,
  verifyAdminLoginToken,
  verifyAdminSessionValue,
} from "../../src/lib/server/admin-session.ts";

function test(name: string, task: () => void) {
  try {
    task();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  }
}

const env = {
  ADMIN_DASHBOARD_TOKEN: "secret-token",
};

test("verifies the configured admin login token", () => {
  assert.equal(verifyAdminLoginToken(" secret-token ", env), true);
  assert.equal(verifyAdminLoginToken("wrong", env), false);
  assert.equal(verifyAdminLoginToken("secret-token", {}), false);
});

test("creates and verifies signed admin session cookies", () => {
  const now = Date.UTC(2026, 4, 13, 0, 0, 0);
  const value = createAdminSessionValue(now, env);

  assert.equal(verifyAdminSessionValue(value, now + 1_000, env), true);
  assert.equal(verifyAdminSessionValue(value, now + 1_000, { ADMIN_DASHBOARD_TOKEN: "other" }), false);
});

test("rejects expired or malformed admin session cookies", () => {
  const now = Date.UTC(2026, 4, 13, 0, 0, 0);
  const value = createAdminSessionValue(now, env);

  assert.equal(verifyAdminSessionValue(value, now + 60 * 60 * 9 * 1_000, env), false);
  assert.equal(verifyAdminSessionValue("bad.cookie", now, env), false);
});
