// ────────────────────────────────────────────────────────────
// PDF Generation Utility (M7)
// Genera texto plano estructurado como contenido de PDF.
// En producción se reemplaza con PDFKit; por ahora genera
// un string que representa el contenido completo de la póliza.
// ────────────────────────────────────────────────────────────

export interface PolizaPdfData {
  numeroPoliza: string;
  tenantNombre: string;
  clienteRfc: string;
  tipoSolicitante: string;
  tipoFianza: string;
  montoAprobado: number;
  prima: number;
  fechaInicio: string;
  fechaVencimiento: string;
  originadorNombre?: string;
  decision: string;
  condiciones?: string;
  score?: number;
  recomendacion?: string;
}

export function generatePolizaPdfContent(data: PolizaPdfData): string {
  const lines = [
    "═".repeat(60),
    "              PÓLIZA DE FIANZA",
    `              ${data.tenantNombre}`,
    "═".repeat(60),
    "",
    `Número de póliza:     ${data.numeroPoliza}`,
    `Fecha de emisión:     ${new Date().toISOString().slice(0, 10)}`,
    "",
    "─".repeat(60),
    "DATOS DEL SOLICITANTE",
    "─".repeat(60),
    `RFC:                  ${data.clienteRfc}`,
    `Tipo solicitante:     ${data.tipoSolicitante}`,
    `Tipo de fianza:       ${data.tipoFianza}`,
    "",
    "─".repeat(60),
    "CONDICIONES DE LA PÓLIZA",
    "─".repeat(60),
    `Monto aprobado:       $${data.montoAprobado.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
    `Prima:                $${data.prima.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
    `Vigencia desde:       ${data.fechaInicio}`,
    `Vigencia hasta:       ${data.fechaVencimiento}`,
    ""
  ];

  if (data.score !== undefined) {
    lines.push("─".repeat(60));
    lines.push("ANÁLISIS DE RIESGO");
    lines.push("─".repeat(60));
    lines.push(`Score:                ${data.score}/1000`);
    if (data.recomendacion) {
      lines.push(`Recomendación:        ${data.recomendacion.replace(/_/g, " ")}`);
    }
    lines.push("");
  }

  lines.push("─".repeat(60));
  lines.push("DECISIÓN DE SUSCRIPCIÓN");
  lines.push("─".repeat(60));
  lines.push(`Decisión:             ${data.decision.replace(/_/g, " ").toUpperCase()}`);
  if (data.condiciones) {
    lines.push(`Condiciones:          ${data.condiciones}`);
  }
  if (data.originadorNombre) {
    lines.push(`Originador:           ${data.originadorNombre}`);
  }

  lines.push("");
  lines.push("═".repeat(60));
  lines.push("  Este documento fue generado automáticamente por BondexOS.");
  lines.push("  Póliza sujeta a los términos y condiciones del contrato.");
  lines.push("═".repeat(60));

  return lines.join("\n");
}

/**
 * Genera un número de póliza según configuración del tenant.
 * Formato: PREFIJO-AÑO-SECUENCIAL (ej: AFC-2026-000001)
 */
export function generateNumeroPoliza(
  prefijo: string,
  secuencial: number,
  year?: number
): string {
  const y = year ?? new Date().getFullYear();
  const seq = String(secuencial).padStart(6, "0");
  return `${prefijo}-${y}-${seq}`;
}
