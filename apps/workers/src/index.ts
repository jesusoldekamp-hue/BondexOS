import type { AiJobType } from "@bondexos/shared";
import { createAnthropicAdapter, type AnthropicAdapter } from "@bondexos/integrations";

export const WORKER_QUEUE_NAMES = [
  "brokerguard.reverify",
  "brokerguard.alerts",
  "documentos.ai",
  "expedientes.ai"
] as const;

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

export interface WorkerAiJobPayload {
  tipo: AiJobType;
  expedienteId: string;
  documentoId?: string;
  contexto?: Record<string, unknown>;
}

let anthropicAdapter: AnthropicAdapter | null = null;

function getAnthropicAdapter(): AnthropicAdapter {
  if (anthropicAdapter) {
    return anthropicAdapter;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  anthropicAdapter = createAnthropicAdapter(
    apiKey
      ? {
          mode: "real",
          apiKey,
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
        }
      : {
          mode: "sandbox",
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
        }
  );
  return anthropicAdapter;
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
      }
    ]
  };
}

export async function processAiJob(payload: WorkerAiJobPayload, adapter = getAnthropicAdapter()) {
  const input = {
    tipo: payload.tipo,
    expedienteId: payload.expedienteId
  };

  return adapter.runJob({
    ...input,
    ...(payload.documentoId ? { documentoId: payload.documentoId } : {}),
    ...(payload.contexto ? { contexto: payload.contexto } : {})
  });
}

if (process.env.NODE_ENV !== "test") {
  const status = getWorkerRuntimeStatus();
  console.log(`${status.service} listo. Queues activas: ${status.enabledQueues.length}`);
}
