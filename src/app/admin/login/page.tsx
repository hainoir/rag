import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin-login-form";
import { isAdminAuthConfigured, readAdminSession } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await readAdminSession()) {
    redirect("/admin");
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-md content-center gap-6">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-6 shadow-sm">
          <div className="mb-6 grid gap-2">
            <p className="text-sm font-semibold text-[var(--accent)]">运营后台</p>
            <h1 className="text-2xl font-semibold">管理员登录</h1>
            <p className="muted text-sm">使用单密钥访问来源治理、反馈处理和社区审核。</p>
          </div>
          <AdminLoginForm configured={isAdminAuthConfigured()} />
        </div>

        <Link className="text-center text-sm text-[var(--muted)] transition hover:text-[var(--accent)]" href="/">
          返回检索首页
        </Link>
      </section>
    </main>
  );
}
