import { redirect } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { AdminUsersClient } from "../../../components/AdminUsersClient";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <AdminUsersClient />
    </AppShell>
  );
}
