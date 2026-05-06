import type { ExternalAdapter, IntegrationHealth, IntegrationMode } from "./base.js";

// ────────────────────────────────────────────────────────────
// PAC (Proveedor Autorizado de Certificación) Adapter
// ────────────────────────────────────────────────────────────

export interface PacTimbreResult {
  uuid: string;
  fechaTimbrado: string;
  selloSat: string;
  cadenaOriginal: string;
  xmlTimbrado: string;
  noCertificadoSat: string;
}

export interface PacTimbreInput {
  rfcEmisor: string;
  rfcReceptor: string;
  concepto: string;
  monto: number;
  moneda: string;
  serie: string;
  folio: string;
}

export interface PacAdapter extends ExternalAdapter {
  timbrar(input: PacTimbreInput): Promise<PacTimbreResult>;
}

export interface PacAdapterOptions {
  mode?: IntegrationMode;
  apiBaseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  retries?: number;
}

function generateSandboxUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createPacAdapter(options: PacAdapterOptions = {}): PacAdapter {
  const mode = options.mode ?? "sandbox";
  const timeoutMs = options.timeoutMs ?? 5000;
  const retries = options.retries ?? 3;

  return {
    provider: "PAC",
    mode,

    async health(): Promise<IntegrationHealth> {
      return {
        provider: "PAC",
        mode,
        ok: mode === "sandbox" || !!options.apiKey,
        checkedAt: new Date().toISOString(),
        detail: mode === "sandbox" ? "PAC sandbox activo." : "PAC real configurado."
      };
    },

    async timbrar(input: PacTimbreInput): Promise<PacTimbreResult> {
      if (mode === "sandbox") {
        const uuid = generateSandboxUuid();
        return {
          uuid,
          fechaTimbrado: new Date().toISOString(),
          selloSat: `SANDBOX_SELLO_${uuid.slice(0, 8).toUpperCase()}`,
          cadenaOriginal: `||1.1|${uuid}|${input.rfcEmisor}|${input.rfcReceptor}|${input.monto}||`,
          xmlTimbrado: [
            `<?xml version="1.0" encoding="UTF-8"?>`,
            `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"`,
            `  Serie="${input.serie}" Folio="${input.folio}" Moneda="${input.moneda}"`,
            `  Total="${input.monto.toFixed(2)}">`,
            `  <cfdi:Emisor Rfc="${input.rfcEmisor}" />`,
            `  <cfdi:Receptor Rfc="${input.rfcReceptor}" />`,
            `  <cfdi:Conceptos>`,
            `    <cfdi:Concepto Descripcion="${input.concepto}" Importe="${input.monto.toFixed(2)}" />`,
            `  </cfdi:Conceptos>`,
            `  <cfdi:Complemento>`,
            `    <tfd:TimbreFiscalDigital UUID="${uuid}" FechaTimbrado="${new Date().toISOString()}"`,
            `      SelloSAT="SANDBOX" NoCertificadoSAT="00001000000509465028" />`,
            `  </cfdi:Complemento>`,
            `</cfdi:Comprobante>`
          ].join("\n"),
          noCertificadoSat: "00001000000509465028"
        };
      }

      // Modo real — llamar al PAC
      if (!options.apiBaseUrl || !options.apiKey) {
        throw new Error("PAC real requiere PAC_API_BASE_URL y PAC_API_KEY.");
      }

      let lastError: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const res = await fetch(`${options.apiBaseUrl}/api/timbrar`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${options.apiKey}`
              },
              body: JSON.stringify(input),
              signal: controller.signal
            });
            if (!res.ok) throw new Error(`PAC respondio ${res.status}.`);
            return (await res.json()) as PacTimbreResult;
          } finally {
            clearTimeout(timer);
          }
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError;
    }
  };
}
