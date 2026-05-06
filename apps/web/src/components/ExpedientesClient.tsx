"use client";

import { useEffect, useMemo, useState } from "react";
import type { PfRutaCapacidad, TipoFianza, TipoSolicitante } from "@bondexos/shared";
import { PF_RUTAS_CAPACIDAD, TIPO_SOLICITANTE, TIPOS_FIANZA } from "@bondexos/shared";
import { getBrowserApiUrl } from "../lib/env";
import { createClient } from "../lib/supabase/client";

interface OriginadorRow {
  id: string;
  usuarioId: string;
  tipoOriginador: "broker_cedulado" | "vendedor_interno";
  cedulaNum: string | null;
  cedulaEstado: string | null;
  cedulaVence: string | null;
}

interface ExpedienteRow {
  id: string;
  originadorId: string;
  clienteRfc: string;
  tipoSolicitante: TipoSolicitante;
  pfRutaCapacidad: PfRutaCapacidad | null;
  tipoFianza: TipoFianza;
  estado: string;
  montoSolicitado: number;
  progresoObligatorio: number;
  aiEstado: string;
  createdAt: string;
}

interface DocumentoRow {
  id: string;
  tipo: string;
  nombre: string;
  obligatorio: boolean;
  estado: "pendiente" | "cargado" | "validado" | "rechazado";
  r2Key: string | null;
  orden: number;
}

interface AiJobRow {
  id: string;
  tipo: string;
  estado: string;
  createdAt: string;
}

interface ExpedienteDetail {
  expediente: ExpedienteRow;
  documentos: DocumentoRow[];
  aiJobs: AiJobRow[];
}

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

type MessageTone = "neutral" | "error" | "success";

const DEFAULT_FORM = {
  originadorId: "",
  clienteRfc: "",
  tipoSolicitante: "PM" as TipoSolicitante,
  pfRutaCapacidad: "C1" as PfRutaCapacidad,
  pfEstadoCivil: "",
  tipoFianza: "administrativa" as TipoFianza,
  montoSolicitado: "500000"
};

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function getApiMessage(body: unknown, fallback: string): string {
  const errorBody = body as ApiErrorBody;
  return errorBody.error?.message ?? fallback;
}

export function ExpedientesClient() {
  const [originadores, setOriginadores] = useState<OriginadorRow[]>([]);
  const [expedientes, setExpedientes] = useState<ExpedienteRow[]>([]);
  const [detail, setDetail] = useState<ExpedienteDetail | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [message, setMessage] = useState<{ text: string; tone: MessageTone } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedOriginador = useMemo(
    () => originadores.find((originador) => originador.id === form.originadorId) ?? null,
    [form.originadorId, originadores]
  );

  async function authorizedFetch(path: string, init: RequestInit = {}) {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    return fetch(`${getBrowserApiUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers
      }
    });
  }

  async function loadData() {
    setIsLoading(true);
    setMessage(null);
    try {
      const [originadoresResponse, expedientesResponse] = await Promise.all([
        authorizedFetch("/api/v1/originadores"),
        authorizedFetch("/api/v1/expedientes")
      ]);

      const originadoresBody = (await originadoresResponse.json()) as {
        originadores?: OriginadorRow[];
      } & ApiErrorBody;
      const expedientesBody = (await expedientesResponse.json()) as {
        expedientes?: ExpedienteRow[];
      } & ApiErrorBody;

      if (!originadoresResponse.ok) {
        throw new Error(getApiMessage(originadoresBody, "No se pudieron cargar originadores."));
      }
      if (!expedientesResponse.ok) {
        throw new Error(getApiMessage(expedientesBody, "No se pudieron cargar expedientes."));
      }

      const loadedOriginadores = originadoresBody.originadores ?? [];
      setOriginadores(loadedOriginadores);
      setExpedientes(expedientesBody.expedientes ?? []);
      setForm((current) => ({
        ...current,
        originadorId: current.originadorId || loadedOriginadores[0]?.id || ""
      }));
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "No se pudo cargar informacion.",
        tone: "error"
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(expedienteId: string) {
    setMessage(null);
    try {
      const response = await authorizedFetch(`/api/v1/expedientes/${expedienteId}`);
      const body = (await response.json()) as ExpedienteDetail & ApiErrorBody;
      if (!response.ok) {
        throw new Error(getApiMessage(body, "No se pudo cargar expediente."));
      }
      setDetail(body);
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "No se pudo cargar expediente.",
        tone: "error"
      });
    }
  }

  async function createExpediente(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    try {
      const payload = {
        originadorId: form.originadorId,
        clienteRfc: form.clienteRfc,
        tipoSolicitante: form.tipoSolicitante,
        tipoFianza: form.tipoFianza,
        montoSolicitado: Number(form.montoSolicitado),
        ...(form.tipoSolicitante === "PF" ? { pfRutaCapacidad: form.pfRutaCapacidad } : {}),
        ...(form.tipoSolicitante === "PF" && form.pfEstadoCivil
          ? { pfEstadoCivil: form.pfEstadoCivil }
          : {})
      };

      const response = await authorizedFetch("/api/v1/expedientes", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as ExpedienteDetail & ApiErrorBody;
      if (!response.ok) {
        throw new Error(getApiMessage(body, "No se pudo crear expediente."));
      }

      setDetail(body);
      setForm((current) => ({
        ...DEFAULT_FORM,
        originadorId: current.originadorId
      }));
      await loadData();
      setMessage({ text: "Expediente creado con checklist materializado.", tone: "success" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "No se pudo crear expediente.",
        tone: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestUpload(documento: DocumentoRow) {
    if (!detail) {
      return;
    }

    try {
      const response = await authorizedFetch(
        `/api/v1/expedientes/${detail.expediente.id}/documentos/${documento.id}/upload-url`,
        {
          method: "POST",
          body: JSON.stringify({
            filename: `${documento.tipo}.pdf`,
            contentType: "application/pdf",
            sizeBytes: 1000
          })
        }
      );
      const body = (await response.json()) as {
        upload?: {
          key: string;
          url: string;
        };
      } & ApiErrorBody;
      if (!response.ok || !body.upload) {
        throw new Error(getApiMessage(body, "No se pudo generar URL."));
      }

      await markDocumento(documento, "cargado", body.upload.key);
      setMessage({ text: `URL lista: ${body.upload.key}`, tone: "success" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "No se pudo generar URL.",
        tone: "error"
      });
    }
  }

  async function markDocumento(documento: DocumentoRow, estado: DocumentoRow["estado"], r2Key?: string) {
    if (!detail) {
      return;
    }

    const payload = {
      estado,
      ...(r2Key ? { r2Key, urlR2: `https://r2.sandbox.bondexos.local/${r2Key}`, sizeBytes: 1000 } : {}),
      ...(estado === "validado" ? { fuenteValidacion: "humana" } : {}),
      ...(estado === "rechazado" ? { rechazadoMotivo: "Documento no cumple validacion." } : {})
    };

    const response = await authorizedFetch(
      `/api/v1/expedientes/${detail.expediente.id}/documentos/${documento.id}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );
    const body = (await response.json()) as ApiErrorBody;
    if (!response.ok) {
      throw new Error(getApiMessage(body, "No se pudo actualizar documento."));
    }

    await loadDetail(detail.expediente.id);
    await loadData();
  }

  async function submitExpediente() {
    if (!detail) {
      return;
    }

    try {
      const response = await authorizedFetch(`/api/v1/expedientes/${detail.expediente.id}/submit`, {
        method: "POST"
      });
      const body = (await response.json()) as ExpedienteDetail & ApiErrorBody;
      if (!response.ok) {
        throw new Error(getApiMessage(body, "No se pudo enviar a suscripcion."));
      }
      setDetail(body);
      await loadData();
      setMessage({ text: "Expediente enviado a suscripcion.", tone: "success" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "No se pudo enviar a suscripcion.",
        tone: "error"
      });
    }
  }

  async function enqueueAiJob(tipo: string, documentoId?: string) {
    if (!detail) {
      return;
    }

    try {
      const response = await authorizedFetch("/api/v1/ai/jobs", {
        method: "POST",
        body: JSON.stringify({
          expedienteId: detail.expediente.id,
          tipo,
          ...(documentoId ? { documentoId } : {})
        })
      });
      const body = (await response.json()) as ApiErrorBody;
      if (!response.ok) {
        throw new Error(getApiMessage(body, "No se pudo encolar job IA."));
      }
      await loadDetail(detail.expediente.id);
      setMessage({ text: "Job IA encolado.", tone: "success" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "No se pudo encolar job IA.",
        tone: "error"
      });
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <section className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-bondexos-ink">Expedientes</h1>
              <p className="mt-1 text-sm text-bondexos-muted">
                {isLoading ? "Cargando..." : `${expedientes.length} en flujo`}
              </p>
            </div>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={() => void loadData()}
            >
              Actualizar
            </button>
          </div>

          <form className="mt-5 space-y-3" onSubmit={createExpediente}>
            <Field label="Originador">
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.originadorId}
                onChange={(event) => setForm((current) => ({ ...current, originadorId: event.target.value }))}
                required
              >
                {originadores.map((originador) => (
                  <option key={originador.id} value={originador.id}>
                    {originador.tipoOriginador}
                    {originador.cedulaEstado ? ` · ${originador.cedulaEstado}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            {selectedOriginador?.cedulaEstado ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Cedula {selectedOriginador.cedulaNum}: {selectedOriginador.cedulaEstado}
                {selectedOriginador.cedulaVence ? ` · vence ${selectedOriginador.cedulaVence}` : ""}
              </p>
            ) : null}

            <Field label="RFC cliente">
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
                value={form.clienteRfc}
                onChange={(event) => setForm((current) => ({ ...current, clienteRfc: event.target.value }))}
                placeholder="XAXX010101000"
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Solicitante">
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={form.tipoSolicitante}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      tipoSolicitante: event.target.value as TipoSolicitante
                    }))
                  }
                >
                  {TIPO_SOLICITANTE.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo fianza">
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={form.tipoFianza}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tipoFianza: event.target.value as TipoFianza }))
                  }
                >
                  {TIPOS_FIANZA.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {form.tipoSolicitante === "PF" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ruta PF">
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.pfRutaCapacidad}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pfRutaCapacidad: event.target.value as PfRutaCapacidad
                      }))
                    }
                  >
                    {PF_RUTAS_CAPACIDAD.map((ruta) => (
                      <option key={ruta} value={ruta}>
                        {ruta}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Estado civil">
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.pfEstadoCivil}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, pfEstadoCivil: event.target.value }))
                    }
                    placeholder="soltero"
                  />
                </Field>
              </div>
            ) : null}

            <Field label="Monto solicitado">
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                min="1"
                type="number"
                value={form.montoSolicitado}
                onChange={(event) => setForm((current) => ({ ...current, montoSolicitado: event.target.value }))}
                required
              />
            </Field>

            <button
              className="w-full rounded-md bg-bondexos-accent px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting || !form.originadorId}
              type="submit"
            >
              Crear expediente
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bandeja</h2>
          </div>
          <div className="divide-y divide-slate-200">
            {expedientes.length > 0 ? (
              expedientes.map((expediente) => (
                <button
                  className="grid w-full gap-2 px-5 py-4 text-left hover:bg-slate-50 md:grid-cols-[1fr_150px_90px]"
                  key={expediente.id}
                  type="button"
                  onClick={() => void loadDetail(expediente.id)}
                >
                  <span>
                    <span className="block text-sm font-semibold text-bondexos-ink">
                      {expediente.clienteRfc}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {expediente.tipoSolicitante} · {expediente.tipoFianza} · $
                      {expediente.montoSolicitado.toLocaleString("es-MX")}
                    </span>
                  </span>
                  <span className="text-sm text-slate-600">{expediente.estado}</span>
                  <span className="text-sm font-semibold text-bondexos-accent">
                    {expediente.progresoObligatorio}%
                  </span>
                </button>
              ))
            ) : (
              <p className="px-5 py-8 text-sm text-slate-500">No hay expedientes para mostrar.</p>
            )}
          </div>
        </div>
      </div>

      {message ? (
        <p
          className={[
            "rounded-md border p-3 text-sm",
            message.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-700"
          ].join(" ")}
        >
          {message.text}
        </p>
      ) : null}

      {detail ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-bondexos-ink">
                  {detail.expediente.clienteRfc}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {detail.expediente.estado} · {detail.expediente.progresoObligatorio}% obligatorio
                </p>
              </div>
              <button
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                type="button"
                onClick={() => void submitExpediente()}
              >
                Enviar
              </button>
            </div>

            <div className="divide-y divide-slate-200">
              {detail.documentos.map((documento) => (
                <div
                  className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_110px_260px] md:items-center"
                  key={documento.id}
                >
                  <div>
                    <p className="text-sm font-semibold text-bondexos-ink">{documento.nombre}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {documento.obligatorio ? "Obligatorio" : "Condicional"} · {documento.tipo}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-slate-700">{documento.estado}</span>
                  <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                    <ActionButton onClick={() => void requestUpload(documento)}>PDF</ActionButton>
                    <ActionButton onClick={() => void markDocumento(documento, "validado")}>
                      Validar
                    </ActionButton>
                    <ActionButton onClick={() => void enqueueAiJob("clasificar_documento", documento.id)}>
                      IA
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Motor IA</h2>
            <div className="mt-4 grid gap-2">
              <button
                className="rounded-md border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={() => void enqueueAiJob("analizar_financiero")}
              >
                Analisis financiero
              </button>
              <button
                className="rounded-md border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={() => void enqueueAiJob("generar_memo")}
              >
                Memo IA
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {detail.aiJobs.length > 0 ? (
                detail.aiJobs.map((job) => (
                  <div className="rounded-md border border-slate-200 p-3" key={job.id}>
                    <p className="text-sm font-semibold text-bondexos-ink">{job.tipo}</p>
                    <p className="mt-1 text-xs text-slate-500">{job.estado}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sin jobs encolados.</p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
