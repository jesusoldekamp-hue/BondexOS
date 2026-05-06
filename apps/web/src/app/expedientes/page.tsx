import { redirect } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { ExpedientesClient } from "../../components/ExpedientesClient";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ExpedientesPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <ExpedientesClient />
    </AppShell>
  );
}
