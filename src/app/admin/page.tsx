import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin-dashboard";
import { readAdminSession } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await readAdminSession())) {
    redirect("/admin/login");
  }

  return (
    <main className="min-h-screen">
      <AdminDashboard />
    </main>
  );
}
