"use client";

import type { FormEvent } from "react";
import { useState } from "react";

export function AdminLoginForm({ configured }: { configured: boolean }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(configured ? null : "后台访问口令尚未配置。");
  const [submitting, setSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        setError(response.status === 401 ? "口令不正确。" : "后台登录暂不可用。");
        return;
      }

      window.location.href = "/admin";
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "后台登录失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={submitLogin}>
      <label className="grid gap-2 text-sm font-semibold" htmlFor="admin-token">
        管理口令
        <input
          autoComplete="current-password"
          className="min-h-12 rounded-lg border border-[var(--line)] bg-white/80 px-4 text-base outline-none transition focus:border-[var(--accent)]"
          disabled={!configured || submitting}
          id="admin-token"
          onChange={(event) => setToken(event.target.value)}
          placeholder="ADMIN_DASHBOARD_TOKEN"
          type="password"
          value={token}
        />
      </label>

      {error ? <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <button
        className="min-h-12 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={!configured || !token.trim() || submitting}
        type="submit"
      >
        {submitting ? "登录中" : "进入后台"}
      </button>
    </form>
  );
}
