import { redirect } from "next/navigation";
import { apiGet } from "../../lib/api";
import { createClient } from "../../lib/supabase/server";
import { AppShell } from "../../components/AppShell";

export const dynamic = "force-dynamic";

interface MeResponse {
  usuario: {
    email: string;
    nombre: string;
    rol: string;
    activo: boolean;
  };
  tenant: {
    nombre: string;
    plan: string;
  };
}

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  const result = session?.access_token
    ? await apiGet<MeResponse>("/api/v1/auth/me", session.access_token)
    : { data: null, error: "Sesion no disponible." };

  return (
    <AppShell>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-bondexos-ink">Dashboard</h1>
        {result.data ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Info label="Usuario" value={result.data.usuario.nombre} />
            <Info label="Email" value={result.data.usuario.email} />
            <Info label="Rol" value={result.data.usuario.rol} />
            <Info label="Tenant" value={result.data.tenant.nombre} />
            <Info label="Plan" value={result.data.tenant.plan} />
            <Info label="Estado" value={result.data.usuario.activo ? "Activo" : "Inactivo"} />
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {result.error}
          </p>
        )}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <ModuleLink href="/expedientes" title="BrokerGuard" value="Modulo 2" />
        <ModuleLink href="/expedientes" title="Expediente digital" value="Modulo 3" />
        <ModuleLink href="/expedientes" title="Motor IA" value="Modulo 4" />
      </section>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-bondexos-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-bondexos-ink">{value}</p>
    </div>
  );
}

function ModuleLink({ href, title, value }: { href: string; title: string; value: string }) {
  return (
    <a className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-teal-700" href={href}>
      <p className="text-xs font-semibold uppercase tracking-wide text-bondexos-muted">{value}</p>
      <p className="mt-2 text-sm font-semibold text-bondexos-ink">{title}</p>
    </a>
  );
}
