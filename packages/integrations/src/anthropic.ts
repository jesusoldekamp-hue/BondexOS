import type { AiJobEstado, AiJobType } from "@bondexos/shared";
import {
  AnalisisFinancieroOutputSchema,
  DocumentoClasificacionOutputSchema,
  DocumentoExtraccionOutputSchema,
  MemoSuscripcionOutputSchema,
  ValidacionCoherenciaOutputSchema
} from "@bondexos/shared";
import type { AiAnalysisAdapter, IntegrationHealth, IntegrationMode } from "./base.js";

export interface AiJobExecutionInput {
  tipo: AiJobType;
  expedienteId: string;
  documentoId?: string;
  contexto?: Record<string, unknown>;
}

export interface AiJobExecutionResult {
  estado: AiJobEstado;
  outputJson: Record<string, unknown>;
  errorMessage?: string;
}

export interface AnthropicAdapter extends AiAnalysisAdapter {
  runJob(input: AiJobExecutionInput): Promise<AiJobExecutionResult>;
}

export interface AnthropicAdapterOptions {
  mode?: IntegrationMode;
  apiKey?: string;
  model?: string;
}

function getOutputSchema(tipo: AiJobType) {
  if (tipo === "clasificar_documento") {
    return DocumentoClasificacionOutputSchema;
  }

  if (tipo === "extraer_datos") {
    return DocumentoExtraccionOutputSchema;
  }

  if (tipo === "validar_coherencia") {
    return ValidacionCoherenciaOutputSchema;
  }

  if (tipo === "analizar_financiero" || tipo === "analizar_patrimonial") {
    return AnalisisFinancieroOutputSchema;
  }

  return MemoSuscripcionOutputSchema;
}

function sandboxOutput(input: AiJobExecutionInput): Record<string, unknown> {
  if (input.tipo === "clasificar_documento") {
    return {
      tipoDocumento: "documento_soporte",
      confianza: 0.91,
      camposDetectados: ["rfc", "nombre", "fecha"],
      requiereRevision: false
    };
  }

  if (input.tipo === "extraer_datos") {
    return {
      campos: {
        rfc: "XAXX010101000",
        nombre: "Cliente Sandbox",
        fechaDocumento: new Date().toISOString().slice(0, 10)
      },
      confianza: 0.88,
      inconsistencias: [],
      requiereRevision: false
    };
  }

  if (input.tipo === "validar_coherencia") {
    return {
      valido: true,
      hallazgos: [],
      requiereRevision: false
    };
  }

  if (input.tipo === "analizar_financiero" || input.tipo === "analizar_patrimonial") {
    return {
      tipoAnalisis: input.tipo === "analizar_patrimonial" ? "patrimonial" : "ratios",
      ratios: {
        liquidez: 1.35,
        solvencia: 2.1,
        rentabilidad: 0.14
      },
      score: 720,
      recomendacion: "sin_garantia",
      supuestos: ["Salida generada en sandbox con datos sinteticos."],
      alertas: [],
      requiereRevision: false
    };
  }

  return {
    resumen: "Expediente con documentacion obligatoria validada y perfil aceptable para revision de suscripcion.",
    fortalezas: ["Documentacion completa", "Indicadores sin alertas criticas"],
    riesgos: ["Confirmar vigencia de informacion financiera antes de emitir"],
    recomendacion: "Continuar a suscripcion con revision humana.",
    condicionesSugeridas: [],
    requiereRevision: false
  };
}

function buildPrompt(input: AiJobExecutionInput): string {
  return [
    "Eres el motor IA de BondexOS para fianzas en Mexico.",
    "Responde exclusivamente JSON valido, sin markdown ni texto adicional.",
    `Tipo de job: ${input.tipo}.`,
    `Expediente: ${input.expedienteId}.`,
    input.documentoId ? `Documento: ${input.documentoId}.` : "",
    "Contexto:",
    JSON.stringify(input.contexto ?? {}, null, 2)
  ]
    .filter(Boolean)
    .join("\n");
}

function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("La respuesta IA no contiene un objeto JSON.");
  }

  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}): AnthropicAdapter {
  const mode = options.mode ?? "sandbox";
  const model = options.model ?? "claude-sonnet-4-6";

  return {
    provider: "Anthropic",
    mode,
    model,

    async health(): Promise<IntegrationHealth> {
      return {
        provider: "Anthropic",
        mode,
        ok: mode === "sandbox" || !!options.apiKey,
        checkedAt: new Date().toISOString(),
        detail: mode === "sandbox" ? "IA sandbox activa." : "Adapter Anthropic real configurado."
      };
    },

    async runJob(input: AiJobExecutionInput): Promise<AiJobExecutionResult> {
      try {
        const rawOutput =
          mode === "sandbox"
            ? sandboxOutput(input)
            : await callAnthropic(
                options.apiKey
                  ? {
                      input,
                      model,
                      apiKey: options.apiKey
                    }
                  : {
                      input,
                      model
                    }
              );

        const parsed = getOutputSchema(input.tipo).safeParse(rawOutput);
        if (!parsed.success) {
          return {
            estado: "revision",
            outputJson: {
              rawOutput
            },
            errorMessage: parsed.error.issues.map((issue) => issue.message).join("; ")
          };
        }

        const requiresReview =
          typeof parsed.data === "object" &&
          parsed.data !== null &&
          "requiereRevision" in parsed.data &&
          parsed.data.requiereRevision === true;

        return {
          estado: requiresReview ? "revision" : "completado",
          outputJson: parsed.data
        };
      } catch (error) {
        return {
          estado: "fallido",
          outputJson: {},
          errorMessage: error instanceof Error ? error.message : "Error desconocido en motor IA."
        };
      }
    }
  };
}

async function callAnthropic(params: {
  input: AiJobExecutionInput;
  model: string;
  apiKey?: string | undefined;
}): Promise<unknown> {
  if (!params.apiKey) {
    throw new Error("ANTHROPIC_API_KEY es obligatoria en modo real.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 1400,
      messages: [
        {
          role: "user",
          content: buildPrompt(params.input)
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic respondio ${response.status}.`);
  }

  const body = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = body.content?.find((part) => part.type === "text" && part.text)?.text;
  if (!text) {
    throw new Error("Anthropic no regreso contenido de texto.");
  }

  return parseJsonObject(text);
}
