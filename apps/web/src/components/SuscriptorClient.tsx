"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { getApiUrl } from "@/lib/env";

interface Expediente {
  id: string;
  clienteRfc: string;
  tipoSolicitante: string;
  tipoFianza: string;
  montoSolicitado: number;
  score: number | null;
  estado: string;
  progresoObligatorio: number;
  createdAt: string;
}

interface DocumentoItem {
  id: string;
  tipo: string;
  nombre: string;
  obligatorio: boolean;
  estado: string;
}

interface AiJob {
  id: string;
  tipo: string;
  estado: string;
  outputJson: Record<string, unknown>;
}

interface ExpedienteDetail {
  expediente: Expediente;
  documentos: DocumentoItem[];
  aiJobs: AiJob[];
}

interface ScoringResult {
  ruta: string;
  score: number;
  recomendacion: string;
  componentes: Array<{
    nombre: string;
    peso: number;
    valorBruto: number;
    valorNormalizado: number;
    puntos: number;
  }>;
}

interface Decision {
  id: string;
  decision: string;
  condiciones: string | null;
  motivoRechazo: string | null;
  timestamp: string;
}

type DecisionType = "aprobado" | "aprobado_con_condiciones" | "pendiente" | "rechazado";

const BADGE_COLORS: Record<string, string> = {
  sin_garantia: "#22c55e",
  obligado_solidario: "#eab308",
  garantia_inmobiliaria: "#ef4444"
};

const BADGE_LABELS: Record<string, string> = {
  sin_garantia: "Sin garantía",
  obligado_solidario: "Obligado solidario",
  garantia_inmobiliaria: "Garantía inmobiliaria"
};

export default function SuscriptorClient() {
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [selected, setSelected] = useState<ExpedienteDetail | null>(null);
  const [scoring, setScoring] = useState<ScoringResult | null>(null);
  const [decisiones, setDecisiones] = useState<Decision[]>([]);
  const [memo, setMemo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Decision form state
  const [decisionType, setDecisionType] = useState<DecisionType>("aprobado");
  const [condiciones, setCondiciones] = useState("");
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const apiUrl = getApiUrl();

  const getToken = useCallback(async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const headers = useCallback(
    async () => ({
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": "application/json"
    }),
    [getToken]
  );

  const loadCola = useCallback(async () => {
    try {
      setLoading(true);
      const h = await headers();
      const res = await fetch(`${apiUrl}/api/v1/suscripcion/cola`, { headers: h });
      if (!res.ok) throw new Error("Error cargando cola");
      const data = await res.json();
      setExpedientes(data.expedientes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, headers]);

  useEffect(() => {
    loadCola();
  }, [loadCola]);

  const selectExpediente = async (id: string) => {
    try {
      const h = await headers();

      // Load detail
      const detailRes = await fetch(`${apiUrl}/api/v1/expedientes/${id}`, { headers: h });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        setSelected(detail);

        // Find memo from AI jobs
        const memoJob = (detail.aiJobs ?? []).find(
          (j: AiJob) => j.tipo === "generar_memo" && j.estado === "completado"
        );
        setMemo(memoJob?.outputJson ?? null);
      }

      // Load score
      const scoreRes = await fetch(`${apiUrl}/api/v1/suscripcion/expedientes/${id}/score`, {
        headers: h
      });
      if (scoreRes.ok) {
        const scoreData = await scoreRes.json();
        setScoring(scoreData.analisis ?? scoreData.scoring ?? null);
      } else {
        setScoring(null);
      }

      // Load decisiones
      const decRes = await fetch(`${apiUrl}/api/v1/suscripcion/expedientes/${id}/decisiones`, {
        headers: h
      });
      if (decRes.ok) {
        const decData = await decRes.json();
        setDecisiones(decData.decisiones ?? []);
      }
    } catch {
      setError("Error cargando detalle");
    }
  };

  const calcularScore = async () => {
    if (!selected) return;
    try {
      const h = await headers();
      const res = await fetch(
        `${apiUrl}/api/v1/suscripcion/expedientes/${selected.expediente.id}/score`,
        { method: "POST", headers: h }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Error calculando score");
      }
      const data = await res.json();
      setScoring(data.scoring);
      // Refresh detail to update score
      await selectExpediente(selected.expediente.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const submitDecision = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const h = await headers();
      const body: Record<string, unknown> = { decision: decisionType };
      if (decisionType === "aprobado_con_condiciones") body.condiciones = condiciones;
      if (decisionType === "rechazado" || decisionType === "pendiente") body.motivoRechazo = motivo;

      const res = await fetch(
        `${apiUrl}/api/v1/suscripcion/expedientes/${selected.expediente.id}/decision`,
        { method: "POST", headers: h, body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Error registrando decision");
      }
      setCondiciones("");
      setMotivo("");
      await selectExpediente(selected.expediente.id);
      await loadCola();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  const recomendacion = scoring
    ? (scoring as unknown as { recomendacion?: string }).recomendacion ?? null
    : null;

  return (
    <div style={{ display: "flex", gap: "1.5rem", minHeight: "80vh" }}>
      {/* ── Cola izquierda ── */}
      <div
        style={{
          width: "340px",
          flexShrink: 0,
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "1.25rem",
          background: "#fff"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Cola suscripción</h2>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              {expedientes.length} expediente(s)
            </span>
          </div>
          <button
            onClick={loadCola}
            style={{
              padding: "0.4rem 0.8rem",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              background: "#fff",
              cursor: "pointer",
              fontSize: "0.85rem"
            }}
          >
            Actualizar
          </button>
        </div>

        {loading && <p style={{ color: "#94a3b8" }}>Cargando...</p>}

        {expedientes.map((exp) => (
          <div
            key={exp.id}
            onClick={() => selectExpediente(exp.id)}
            style={{
              padding: "0.75rem",
              border: `2px solid ${selected?.expediente.id === exp.id ? "#0f766e" : "#e2e8f0"}`,
              borderRadius: "8px",
              marginBottom: "0.5rem",
              cursor: "pointer",
              background: selected?.expediente.id === exp.id ? "#f0fdfa" : "#fff",
              transition: "all 0.15s"
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{exp.clienteRfc}</div>
            <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
              {exp.tipoFianza} · ${exp.montoSolicitado.toLocaleString()}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: "#e2e8f0",
                  color: "#334155"
                }}
              >
                {exp.estado}
              </span>
              {exp.score !== null && (
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0f766e" }}>
                  Score: {exp.score}
                </span>
              )}
            </div>
          </div>
        ))}

        {!loading && expedientes.length === 0 && (
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>No hay expedientes en cola.</p>
        )}
      </div>

      {/* ── Detalle derecho ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && (
          <div
            style={{
              padding: "0.75rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#dc2626",
              fontSize: "0.9rem"
            }}
          >
            {error}
            <button onClick={() => setError("")} style={{ marginLeft: "1rem", cursor: "pointer" }}>
              ✕
            </button>
          </div>
        )}

        {!selected ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              background: "#fff"
            }}
          >
            Selecciona un expediente de la cola para revisar.
          </div>
        ) : (
          <>
            {/* Panel 1 — Resumen */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "1.25rem",
                background: "#fff"
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", color: "#334155" }}>
                RESUMEN
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase" }}>RFC</div>
                  <div style={{ fontWeight: 600 }}>{selected.expediente.clienteRfc}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase" }}>Tipo fianza</div>
                  <div style={{ fontWeight: 600 }}>{selected.expediente.tipoFianza}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase" }}>Monto</div>
                  <div style={{ fontWeight: 600 }}>${selected.expediente.montoSolicitado.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase" }}>Solicitante</div>
                  <div style={{ fontWeight: 600 }}>{selected.expediente.tipoSolicitante}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase" }}>Estado</div>
                  <div style={{ fontWeight: 600 }}>{selected.expediente.estado}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase" }}>Progreso docs</div>
                  <div style={{ fontWeight: 600 }}>{selected.expediente.progresoObligatorio}%</div>
                </div>
              </div>
              {recomendacion && (
                <div style={{ marginTop: "0.75rem" }}>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "999px",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      background: BADGE_COLORS[recomendacion] ?? "#94a3b8"
                    }}
                  >
                    {BADGE_LABELS[recomendacion] ?? recomendacion}
                  </span>
                </div>
              )}
            </div>

            {/* Panel 2 — Documentos */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "1.25rem",
                background: "#fff"
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", color: "#334155" }}>
                DOCUMENTOS
              </h3>
              <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "#64748b", fontWeight: 600 }}>
                      Documento
                    </th>
                    <th style={{ textAlign: "center", padding: "0.5rem", color: "#64748b", fontWeight: 600 }}>
                      Obligatorio
                    </th>
                    <th style={{ textAlign: "center", padding: "0.5rem", color: "#64748b", fontWeight: 600 }}>
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selected.documentos.map((doc) => (
                    <tr key={doc.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.5rem" }}>{doc.nombre || doc.tipo}</td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        {doc.obligatorio ? "✔" : "—"}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "999px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background:
                              doc.estado === "validado"
                                ? "#dcfce7"
                                : doc.estado === "rechazado"
                                  ? "#fef2f2"
                                  : "#f1f5f9",
                            color:
                              doc.estado === "validado"
                                ? "#166534"
                                : doc.estado === "rechazado"
                                  ? "#dc2626"
                                  : "#64748b"
                          }}
                        >
                          {doc.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Panel 3 — Análisis financiero / Score */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "1.25rem",
                background: "#fff"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#334155", margin: 0 }}>
                  ANÁLISIS FINANCIERO
                </h3>
                <button
                  onClick={calcularScore}
                  style={{
                    padding: "0.4rem 1rem",
                    background: "#0f766e",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.85rem"
                  }}
                >
                  Calcular score
                </button>
              </div>

              {scoring && "score" in scoring ? (
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ display: "flex", gap: "2rem", alignItems: "center", marginBottom: "1rem" }}>
                    <div>
                      <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#0f766e" }}>
                        {(scoring as ScoringResult).score}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#64748b" }}>/ 1000</div>
                    </div>
                    {recomendacion && (
                      <span
                        style={{
                          padding: "6px 16px",
                          borderRadius: "999px",
                          color: "#fff",
                          fontWeight: 700,
                          background: BADGE_COLORS[recomendacion] ?? "#94a3b8"
                        }}
                      >
                        {BADGE_LABELS[recomendacion] ?? recomendacion}
                      </span>
                    )}
                  </div>

                  {"componentes" in scoring && (
                    <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <th style={{ textAlign: "left", padding: "0.4rem", color: "#64748b" }}>Componente</th>
                          <th style={{ textAlign: "right", padding: "0.4rem", color: "#64748b" }}>Peso</th>
                          <th style={{ textAlign: "right", padding: "0.4rem", color: "#64748b" }}>Normalizado</th>
                          <th style={{ textAlign: "right", padding: "0.4rem", color: "#64748b" }}>Puntos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(scoring as ScoringResult).componentes.map((c) => (
                          <tr key={c.nombre} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "0.4rem", fontWeight: 600 }}>{c.nombre}</td>
                            <td style={{ padding: "0.4rem", textAlign: "right" }}>{(c.peso * 100).toFixed(0)}%</td>
                            <td style={{ padding: "0.4rem", textAlign: "right" }}>{c.valorNormalizado}</td>
                            <td style={{ padding: "0.4rem", textAlign: "right", fontWeight: 700 }}>{c.puntos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <p style={{ color: "#94a3b8", marginTop: "0.75rem", fontSize: "0.9rem" }}>
                  Sin score calculado. Presione &quot;Calcular score&quot; para ejecutar el análisis.
                </p>
              )}
            </div>

            {/* Panel 4 — Memo IA */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "1.25rem",
                background: "#fff"
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", color: "#334155" }}>
                MEMO IA
              </h3>
              {memo ? (
                <div style={{ fontSize: "0.9rem", lineHeight: "1.6" }}>
                  <p>
                    <strong>Resumen:</strong> {(memo as Record<string, unknown>).resumen as string}
                  </p>
                  {Array.isArray((memo as Record<string, unknown>).fortalezas) && (
                    <div>
                      <strong>Fortalezas:</strong>
                      <ul style={{ margin: "0.25rem 0", paddingLeft: "1.2rem" }}>
                        {((memo as Record<string, unknown>).fortalezas as string[]).map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((memo as Record<string, unknown>).riesgos) && (
                    <div>
                      <strong>Riesgos:</strong>
                      <ul style={{ margin: "0.25rem 0", paddingLeft: "1.2rem" }}>
                        {((memo as Record<string, unknown>).riesgos as string[]).map((r, i) => (
                          <li key={i} style={{ color: "#dc2626" }}>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p>
                    <strong>Recomendación:</strong> {(memo as Record<string, unknown>).recomendacion as string}
                  </p>
                </div>
              ) : (
                <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                  Sin memo IA disponible. Ejecute el job de tipo &quot;generar_memo&quot; primero.
                </p>
              )}
            </div>

            {/* Decisiones historial */}
            {decisiones.length > 0 && (
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "1.25rem",
                  background: "#fff"
                }}
              >
                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", color: "#334155" }}>
                  HISTORIAL DE DECISIONES
                </h3>
                {decisiones.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      padding: "0.75rem",
                      border: "1px solid #f1f5f9",
                      borderRadius: "8px",
                      marginBottom: "0.5rem",
                      fontSize: "0.85rem"
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{d.decision.replace(/_/g, " ").toUpperCase()}</div>
                    {d.condiciones && <div>Condiciones: {d.condiciones}</div>}
                    {d.motivoRechazo && <div>Motivo: {d.motivoRechazo}</div>}
                    <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                      {new Date(d.timestamp).toLocaleString("es-MX")}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Panel decisión */}
            <div
              style={{
                border: "2px solid #0f766e",
                borderRadius: "12px",
                padding: "1.25rem",
                background: "#f0fdfa"
              }}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", color: "#0f766e" }}>
                DECISIÓN
              </h3>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                {(["aprobado", "aprobado_con_condiciones", "pendiente", "rechazado"] as DecisionType[]).map(
                  (tipo) => (
                    <button
                      key={tipo}
                      onClick={() => setDecisionType(tipo)}
                      style={{
                        padding: "0.5rem 1rem",
                        border: `2px solid ${decisionType === tipo ? "#0f766e" : "#cbd5e1"}`,
                        borderRadius: "6px",
                        background: decisionType === tipo ? "#0f766e" : "#fff",
                        color: decisionType === tipo ? "#fff" : "#334155",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        transition: "all 0.15s"
                      }}
                    >
                      {tipo.replace(/_/g, " ")}
                    </button>
                  )
                )}
              </div>

              {decisionType === "aprobado_con_condiciones" && (
                <textarea
                  value={condiciones}
                  onChange={(e) => setCondiciones(e.target.value)}
                  placeholder="Condiciones de aprobación..."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    marginBottom: "0.75rem",
                    fontFamily: "inherit",
                    fontSize: "0.9rem"
                  }}
                />
              )}

              {(decisionType === "rechazado" || decisionType === "pendiente") && (
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={decisionType === "rechazado" ? "Motivo de rechazo..." : "Motivo..."}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    marginBottom: "0.75rem",
                    fontFamily: "inherit",
                    fontSize: "0.9rem"
                  }}
                />
              )}

              <button
                onClick={submitDecision}
                disabled={submitting}
                style={{
                  padding: "0.6rem 1.5rem",
                  background: submitting ? "#94a3b8" : "#0f766e",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: submitting ? "default" : "pointer",
                  fontWeight: 700,
                  fontSize: "0.95rem"
                }}
              >
                {submitting ? "Registrando..." : "Registrar decisión"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
