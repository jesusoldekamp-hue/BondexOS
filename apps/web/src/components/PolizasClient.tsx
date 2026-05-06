"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { getApiUrl } from "@/lib/env";

interface Poliza {
  id: string;
  expedienteId: string;
  numeroPoliza: string;
  monto: number;
  prima: number;
  fechaInicio: string;
  fechaVencimiento: string;
  estado: string;
  pdfR2Url: string | null;
  cfdiUuid: string | null;
  createdAt: string;
}

const ESTADO_COLORS: Record<string, string> = {
  emitida: "#22c55e",
  pendiente: "#eab308",
  procesando: "#3b82f6",
  error: "#ef4444"
};

export default function PolizasClient() {
  const [polizas, setPolizas] = useState<Poliza[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  const loadPolizas = useCallback(async () => {
    try {
      setLoading(true);
      const h = await headers();
      const res = await fetch(`${apiUrl}/api/v1/polizas`, { headers: h });
      if (!res.ok) throw new Error("Error cargando polizas");
      const data = await res.json();
      setPolizas(data.polizas ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, headers]);

  useEffect(() => {
    loadPolizas();
  }, [loadPolizas]);

  const downloadPdf = async (polizaId: string) => {
    try {
      const h = await headers();
      const res = await fetch(`${apiUrl}/api/v1/polizas/${polizaId}/pdf`, { headers: h });
      if (!res.ok) throw new Error("PDF no disponible");
      const data = await res.json();
      window.open(data.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error obteniendo PDF");
    }
  };

  return (
    <div style={{ maxWidth: "1000px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Pólizas</h2>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>{polizas.length} póliza(s) emitida(s)</span>
        </div>
        <button
          onClick={loadPolizas}
          style={{
            padding: "0.5rem 1rem",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            background: "#fff",
            cursor: "pointer"
          }}
        >
          Actualizar
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "0.75rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            marginBottom: "1rem",
            fontSize: "0.9rem"
          }}
        >
          {error}
          <button onClick={() => setError("")} style={{ marginLeft: "1rem", cursor: "pointer" }}>
            ✕
          </button>
        </div>
      )}

      {loading && <p style={{ color: "#94a3b8" }}>Cargando pólizas...</p>}

      {!loading && polizas.length === 0 && (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            background: "#fff",
            color: "#94a3b8"
          }}
        >
          No hay pólizas emitidas aún. Las pólizas se generan al aprobar un expediente.
        </div>
      )}

      {polizas.length > 0 && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", color: "#64748b", fontWeight: 600 }}>
                  No. Póliza
                </th>
                <th style={{ textAlign: "right", padding: "0.75rem 1rem", color: "#64748b", fontWeight: 600 }}>
                  Monto
                </th>
                <th style={{ textAlign: "right", padding: "0.75rem 1rem", color: "#64748b", fontWeight: 600 }}>
                  Prima
                </th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem", color: "#64748b", fontWeight: 600 }}>
                  Vigencia
                </th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem", color: "#64748b", fontWeight: 600 }}>
                  Estado
                </th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem", color: "#64748b", fontWeight: 600 }}>
                  CFDI
                </th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem", color: "#64748b", fontWeight: 600 }}>
                  PDF
                </th>
              </tr>
            </thead>
            <tbody>
              {polizas.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{p.numeroPoliza}</td>
                  <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                    ${p.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                    ${p.prima.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontSize: "0.8rem" }}>
                    {p.fechaInicio} → {p.fechaVencimiento}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "999px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#fff",
                        background: ESTADO_COLORS[p.estado] ?? "#94a3b8"
                      }}
                    >
                      {p.estado}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontSize: "0.8rem" }}>
                    {p.cfdiUuid ? (
                      <span title={p.cfdiUuid} style={{ color: "#22c55e" }}>
                        ✔ {p.cfdiUuid.slice(0, 8)}…
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                    {p.pdfR2Url ? (
                      <button
                        onClick={() => downloadPdf(p.id)}
                        style={{
                          padding: "4px 12px",
                          background: "#0f766e",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 600
                        }}
                      >
                        Descargar
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
