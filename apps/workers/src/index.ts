import type { AiJobType } from "@bondexos/shared";
import {
  createAnthropicAdapter,
  createBrokerGuardAdapter,
  createPacAdapter,
  createEmailAdapter,
  createDocumentStorageAdapter,
  generatePolizaPdfContent,
  generateNumeroPoliza,
  type AnthropicAdapter,
  type BrokerGuardAdapter,
  type PacAdapter,
  type EmailAdapter,
  type DocumentStorageAdapter,
  type PacTimbreResult
} from "@bondexos/integrations";

// ────────────────────────────────────────────────────────────
// Queue names
// ────────────────────────────────────────────────────────────

export const WORKER_QUEUE_NAMES = [
  "brokerguard.reverify",
  "brokerguard.alerts",
  "documentos.ai",
  "expedientes.ai",
  "emision.poliza",
  "monitoreo.cedulas",
  "monitoreo.polizas_vencer",
  "monitoreo.reporte_semanal",
  "monitoreo.limpieza_cache"
] as const;

// ────────────────────────────────────────────────────────────
// Runtime status
// ────────────────────────────────────────────────────────────

export interface WorkerRuntimeStatus {
  service: "bondexos-workers";
  ready: boolean;
  enabledQueues: string[];
  schedules: Array<{
    name: string;
    cron: string;
    timezone: string;
  }>;
}

export function getWorkerRuntimeStatus(): WorkerRuntimeStatus {
  return {
    service: "bondexos-workers",
    ready: true,
    enabledQueues: [...WORKER_QUEUE_NAMES],
    schedules: [
      {
        name: "Reverificacion diaria de cedulas activas",
        cron: "0 2 * * *",
        timezone: "America/Mexico_City"
      },
      {
        name: "Alertas de cedulas por vencer 90/60/30",
        cron: "15 2 * * *",
        timezone: "America/Mexico_City"
      },
      {
        name: "Alertas de polizas por vencer 90/60/30",
        cron: "30 2 * * *",
        timezone: "America/Mexico_City"
      },
      {
        name: "Limpieza de cache Redis",
        cron: "0 3 * * *",
        timezone: "America/Mexico_City"
      },
      {
        name: "Reporte semanal (lunes 7AM)",
        cron: "0 7 * * 1",
        timezone: "America/Mexico_City"
      }
    ]
  };
}

// ────────────────────────────────────────────────────────────
// Adapter singletons
// ────────────────────────────────────────────────────────────

let anthropicAdapter: AnthropicAdapter | null = null;
let brokerGuardAdapter: BrokerGuardAdapter | null = null;
let pacAdapter: PacAdapter | null = null;
let emailAdapter: EmailAdapter | null = null;
let storageAdapter: DocumentStorageAdapter | null = null;

function getAnthropicAdapter(): AnthropicAdapter {
  if (!anthropicAdapter) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    anthropicAdapter = createAnthropicAdapter(
      apiKey
        ? { mode: "real", apiKey, model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6" }
        : { mode: "sandbox", model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6" }
    );
  }
  return anthropicAdapter;
}

function getBrokerGuardAdapter(): BrokerGuardAdapter {
  if (!brokerGuardAdapter) {
    brokerGuardAdapter = createBrokerGuardAdapter({
      mode: (process.env.BROKERGUARD_MODE as "sandbox" | "real") ?? "sandbox",
      cnsfBaseUrl: process.env.CNSF_BASE_URL,
      amsfacBaseUrl: process.env.AMSFAC_BASE_URL
    });
  }
  return brokerGuardAdapter;
}

function getPacAdapter(): PacAdapter {
  if (!pacAdapter) {
    pacAdapter = createPacAdapter({
      mode: process.env.PAC_API_KEY ? "real" : "sandbox",
      apiBaseUrl: process.env.PAC_API_BASE_URL,
      apiKey: process.env.PAC_API_KEY
    });
  }
  return pacAdapter;
}

function getEmailAdapter(): EmailAdapter {
  if (!emailAdapter) {
    emailAdapter = createEmailAdapter({
      mode: process.env.EMAIL_API_KEY ? "real" : "sandbox",
      apiBaseUrl: process.env.EMAIL_API_BASE_URL,
      apiKey: process.env.EMAIL_API_KEY,
      fromAddress: process.env.EMAIL_FROM_ADDRESS
    });
  }
  return emailAdapter;
}

function getStorageAdapter(): DocumentStorageAdapter {
  if (!storageAdapter) {
    storageAdapter = createDocumentStorageAdapter({
      mode: process.env.CLOUDFLARE_R2_BUCKET ? "real" : "sandbox",
      bucket: process.env.CLOUDFLARE_R2_BUCKET,
      publicBaseUrl: process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL
    });
  }
  return storageAdapter;
}

// ────────────────────────────────────────────────────────────
// M4 — AI Job processing
// ────────────────────────────────────────────────────────────

export interface WorkerAiJobPayload {
  tipo: AiJobType;
  expedienteId: string;
  documentoId?: string;
  contexto?: Record<string, unknown>;
}

export async function processAiJob(payload: WorkerAiJobPayload, adapter = getAnthropicAdapter()) {
  return adapter.runJob({
    tipo: payload.tipo,
    expedienteId: payload.expedienteId,
    ...(payload.documentoId ? { documentoId: payload.documentoId } : {}),
    ...(payload.contexto ? { contexto: payload.contexto } : {})
  });
}

// ────────────────────────────────────────────────────────────
// M7 — Emisión de póliza
// ────────────────────────────────────────────────────────────

export type EmisionEstado = "pendiente" | "procesando" | "emitida" | "error";

export interface EmisionPayload {
  tenantId: string;
  expedienteId: string;
  tenantNombre: string;
  tenantPrefijo: string;
  secuencialPoliza: number;
  clienteRfc: string;
  tipoSolicitante: string;
  tipoFianza: string;
  montoAprobado: number;
  decision: string;
  condiciones?: string;
  score?: number;
  recomendacion?: string;
  originadorNombre?: string;
  rfcEmisor: string;
}

export interface EmisionResult {
  numeroPoliza: string;
  pdfContent: string;
  pdfR2Key: string;
  pdfR2Url: string;
  cfdi: PacTimbreResult;
  estado: EmisionEstado;
}

export async function processEmision(payload: EmisionPayload): Promise<EmisionResult> {
  const pac = getPacAdapter();
  const storage = getStorageAdapter();

  // 1. Generar número de póliza
  const numeroPoliza = generateNumeroPoliza(payload.tenantPrefijo, payload.secuencialPoliza);

  // 2. Calcular prima (simplificado: 1.5% del monto)
  const prima = Math.round(payload.montoAprobado * 0.015 * 100) / 100;

  // 3. Fechas de vigencia
  const fechaInicio = new Date().toISOString().slice(0, 10);
  const vencimiento = new Date();
  vencimiento.setFullYear(vencimiento.getFullYear() + 1);
  const fechaVencimiento = vencimiento.toISOString().slice(0, 10);

  // 4. Generar PDF
  const pdfContent = generatePolizaPdfContent({
    numeroPoliza,
    tenantNombre: payload.tenantNombre,
    clienteRfc: payload.clienteRfc,
    tipoSolicitante: payload.tipoSolicitante,
    tipoFianza: payload.tipoFianza,
    montoAprobado: payload.montoAprobado,
    prima,
    fechaInicio,
    fechaVencimiento,
    decision: payload.decision,
    condiciones: payload.condiciones,
    score: payload.score,
    recomendacion: payload.recomendacion,
    originadorNombre: payload.originadorNombre
  });

  // 5. Guardar PDF en R2
  const r2Upload = await storage.createUploadUrl({
    tenantId: payload.tenantId,
    expedienteId: payload.expedienteId,
    documentoId: `poliza-${numeroPoliza}`,
    filename: `${numeroPoliza}.pdf`,
    contentType: "application/pdf"
  });

  // 6. Timbrar CFDI
  const cfdi = await pac.timbrar({
    rfcEmisor: payload.rfcEmisor,
    rfcReceptor: payload.clienteRfc,
    concepto: `Prima de fianza ${payload.tipoFianza} - Poliza ${numeroPoliza}`,
    monto: prima,
    moneda: "MXN",
    serie: payload.tenantPrefijo,
    folio: String(payload.secuencialPoliza)
  });

  return {
    numeroPoliza,
    pdfContent,
    pdfR2Key: r2Upload.key,
    pdfR2Url: r2Upload.url,
    cfdi,
    estado: "emitida"
  };
}

// ────────────────────────────────────────────────────────────
// M8 — Monitoreo: Reverificación de cédulas
// ────────────────────────────────────────────────────────────

export interface ReverifyPayload {
  tenantId: string;
  originadorId: string;
  cedulaNum: string;
  cedulaVence?: string | null;
}

export async function processReverifyCedula(payload: ReverifyPayload) {
  const bg = getBrokerGuardAdapter();
  return bg.verify({
    tenantId: payload.tenantId,
    originadorId: payload.originadorId,
    cedulaNum: payload.cedulaNum,
    cedulaVence: payload.cedulaVence
  });
}

// ────────────────────────────────────────────────────────────
// M8 — Monitoreo: Alertas por email
// ────────────────────────────────────────────────────────────

export interface AlertPayload {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

export async function sendAlert(payload: AlertPayload) {
  const email = getEmailAdapter();
  return email.send(payload);
}

// ────────────────────────────────────────────────────────────
// M8 — Monitoreo: Reporte semanal
// ────────────────────────────────────────────────────────────

export interface WeeklyReportData {
  tenantNombre: string;
  adminEmail: string;
  periodo: { desde: string; hasta: string };
  expedientesProcesados: number;
  scorePorTipoFianza: Record<string, number>;
  decisiones: { aprobados: number; rechazados: number; pendientes: number };
  polizasEmitidas: number;
  montoTotal: number;
}

export async function sendWeeklyReport(data: WeeklyReportData) {
  const email = getEmailAdapter();

  const html = [
    `<h1>Reporte Semanal — ${data.tenantNombre}</h1>`,
    `<p>Periodo: ${data.periodo.desde} al ${data.periodo.hasta}</p>`,
    `<h2>Expedientes</h2>`,
    `<p>Procesados: <strong>${data.expedientesProcesados}</strong></p>`,
    `<h2>Decisiones</h2>`,
    `<ul>`,
    `  <li>Aprobados: ${data.decisiones.aprobados}</li>`,
    `  <li>Rechazados: ${data.decisiones.rechazados}</li>`,
    `  <li>Pendientes: ${data.decisiones.pendientes}</li>`,
    `</ul>`,
    `<h2>Pólizas</h2>`,
    `<p>Emitidas: <strong>${data.polizasEmitidas}</strong></p>`,
    `<p>Monto total: <strong>$${data.montoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</strong></p>`,
    `<h2>Scores por tipo de fianza</h2>`,
    `<ul>`,
    ...Object.entries(data.scorePorTipoFianza).map(
      ([tipo, avg]) => `  <li>${tipo}: ${avg}</li>`
    ),
    `</ul>`,
    `<hr>`,
    `<p><em>Generado automáticamente por BondexOS.</em></p>`
  ].join("\n");

  return email.send({
    to: data.adminEmail,
    subject: `BondexOS — Reporte semanal ${data.periodo.desde} al ${data.periodo.hasta}`,
    bodyHtml: html,
    bodyText: `Reporte semanal: ${data.expedientesProcesados} expedientes, ${data.polizasEmitidas} polizas, $${data.montoTotal} total.`
  });
}

// ────────────────────────────────────────────────────────────
// M8 — DLQ handler
// ────────────────────────────────────────────────────────────

export interface DlqEntry {
  queue: string;
  jobId: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastError: string;
  failedAt: string;
}

const dlq: DlqEntry[] = [];

export function addToDlq(entry: DlqEntry): void {
  dlq.push(entry);
  console.error(`[DLQ] Job ${entry.jobId} de cola ${entry.queue} falló después de ${entry.attempts} intentos: ${entry.lastError}`);
}

export function getDlqEntries(): readonly DlqEntry[] {
  return dlq;
}

// ────────────────────────────────────────────────────────────
// Boot
// ────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== "test") {
  const status = getWorkerRuntimeStatus();
  console.log(`${status.service} listo. Queues: ${status.enabledQueues.length}, Schedules: ${status.schedules.length}`);
  status.schedules.forEach((s) => console.log(`  📅 ${s.name} — ${s.cron} (${s.timezone})`));
}
