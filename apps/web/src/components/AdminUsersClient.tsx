"use client";

import { useEffect, useState } from "react";
import type { UsuarioRol } from "@bondexos/shared";
import { USUARIO_ROLES } from "@bondexos/shared";
import { getBrowserApiUrl } from "../lib/env";
import { createClient } from "../lib/supabase/client";

interface UserRow {
  id: string;
  email: string;
  nombre: string;
  rol: UsuarioRol;
  activo: boolean;
}

export function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<UsuarioRol>("suscriptor");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function getAccessToken(): Promise<string | null> {
    const supabase = createClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function loadUsers() {
    setIsLoading(true);
    setMessage(null);
    const token = await getAccessToken();
    if (!token) {
      setMessage("Sesion no disponible.");
      setIsLoading(false);
      return;
    }

    const response = await fetch(`${getBrowserApiUrl()}/api/v1/admin/users`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const body = (await response.json()) as { users?: UserRow[]; error?: { message?: string } };
    setIsLoading(false);

    if (!response.ok) {
      setMessage(body.error?.message ?? "No se pudieron cargar usuarios.");
      return;
    }

    setUsers(body.users ?? []);
  }

  async function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const token = await getAccessToken();
    if (!token) {
      setMessage("Sesion no disponible.");
      return;
    }

    const response = await fetch(`${getBrowserApiUrl()}/api/v1/admin/invitations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, nombre, rol })
    });
    const body = (await response.json()) as { user?: UserRow; error?: { message?: string } };

    if (!response.ok) {
      setMessage(body.error?.message ?? "No se pudo invitar usuario.");
      return;
    }

    setMessage("Invitacion enviada y usuario registrado.");
    setEmail("");
    setNombre("");
    setRol("suscriptor");
    await loadUsers();
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-bondexos-ink">Usuarios</h1>
        <form className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_180px_auto]" onSubmit={inviteUser}>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="email@afianzadora.mx"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Nombre completo"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            required
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={rol}
            onChange={(event) => setRol(event.target.value as UsuarioRol)}
          >
            {USUARIO_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            className="rounded-md bg-bondexos-accent px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            type="submit"
          >
            Invitar
          </button>
        </form>
        {message ? <p className="mt-4 text-sm text-bondexos-muted">{message}</p> : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={4}>
                  Cargando usuarios...
                </td>
              </tr>
            ) : users.length > 0 ? (
              users.map((user) => (
                <tr className="border-t border-slate-200" key={user.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{user.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-slate-600">{user.rol}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {user.activo ? "Activo" : "Inactivo"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={4}>
                  No hay usuarios para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
