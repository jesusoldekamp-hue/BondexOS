import { LoginForm } from "../../components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-bondexos-accent">
            BondexOS
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-bondexos-ink">Acceso privado</h1>
          <p className="mt-2 text-sm leading-6 text-bondexos-muted">
            Inicia sesion con la cuenta que recibiste por invitacion de tu afianzadora.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
