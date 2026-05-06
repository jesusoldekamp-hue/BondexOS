import Link from "next/link";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link className="text-lg font-semibold text-bondexos-ink" href="/dashboard">
            BondexOS
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
            <Link className="hover:text-bondexos-accent" href="/dashboard">
              Dashboard
            </Link>
            <Link className="hover:text-bondexos-accent" href="/expedientes">
              Expedientes
            </Link>
            <Link className="hover:text-bondexos-accent" href="/admin/users">
              Usuarios
            </Link>
            <Link className="hover:text-bondexos-accent" href="/suscriptor">
              Suscriptor
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </main>
  );
}
