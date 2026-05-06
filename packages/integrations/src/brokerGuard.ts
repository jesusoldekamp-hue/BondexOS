import type { BrokerGuardVerification, CedulaEstado } from "@bondexos/shared";
import { BrokerGuardVerificationSchema } from "@bondexos/shared";
import type { ExternalAdapter, IntegrationHealth, IntegrationMode } from "./base.js";
import { MemoryTtlCache, type TtlCache } from "./cache.js";

export interface BrokerGuardVerifyParams {
  tenantId: string;
  originadorId?: string;
  cedulaNum: string;
  cedulaVence?: string | null;
}

export interface BrokerGuardAdapter extends ExternalAdapter {
  verify(params: BrokerGuardVerifyParams): Promise<BrokerGuardVerification>;
}

export interface BrokerGuardAdapterOptions {
  mode?: IntegrationMode;
  cache?: TtlCache;
  ttlSeconds?: number;
  timeoutMs?: number;
  retries?: number;
  cnsfBaseUrl?: string;
  amsfacBaseUrl?: string;
}

interface ProviderLookup {
  estado: CedulaEstado;
  vence: string | null;
  detalle?: string;
  fuente: "cnsf" | "amsfac" | "sandbox" | "fallback";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

function normalizeCedula(cedulaNum: string): string {
  return cedulaNum.trim().toUpperCase().replace(/\s+/g, "");
}

export function isCedulaExpired(vence: string | null | undefined): boolean {
  return !!vence && vence < todayDateOnly();
}

export function brokerGuardBlocksOperation(estado: CedulaEstado | null | undefined, vence?: string | null): boolean {
  if (!estado) {
    return false;
  }

  if (estado === "suspendida" || estado === "cancelada" || estado === "no_registrada") {
    return true;
  }

  return estado === "vigente" && isCedulaExpired(vence);
}

function toVerification(
  params: BrokerGuardVerifyParams,
  lookup: ProviderLookup,
  fuenteOverride?: BrokerGuardVerification["fuente"]
): BrokerGuardVerification {
  const cedulaNum = normalizeCedula(params.cedulaNum);
  const vence = lookup.vence ?? params.cedulaVence ?? null;
  const detalle = lookup.detalle ?? (lookup.estado === "vigente" ? "Cedula vigente." : "Cedula requiere atencion.");
  const result = {
    originadorId: params.originadorId,
    cedulaNum,
    estado: lookup.estado,
    fuente: fuenteOverride ?? lookup.fuente,
    verificadoEn: new Date().toISOString(),
    vence,
    detalle,
    bloqueaOperacion: brokerGuardBlocksOperation(lookup.estado, vence),
    requiereRevision: lookup.estado === "verificacion_pendiente"
  };

  return BrokerGuardVerificationSchema.parse(result);
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`BrokerGuard excedio timeout de ${timeoutMs}ms.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function retry<T>(operation: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function fetchProvider(
  baseUrl: string,
  fuente: "cnsf" | "amsfac",
  cedulaNum: string,
  timeoutMs: number
): Promise<ProviderLookup> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/cedulas/${encodeURIComponent(cedulaNum)}`;
  const data = await withTimeout(async () => {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`${fuente} respondio ${response.status}.`);
    }
    return (await response.json()) as Record<string, unknown>;
  }, timeoutMs);

  const estado = typeof data.estado === "string" ? data.estado : "verificacion_pendiente";
  const parsedEstado = ["vigente", "suspendida", "cancelada", "no_registrada"].includes(estado)
    ? (estado as CedulaEstado)
    : "verificacion_pendiente";
  const vence = typeof data.vence === "string" ? data.vence : null;
  const detalle = typeof data.detalle === "string" ? data.detalle : undefined;

  const lookup: ProviderLookup = {
    estado: parsedEstado,
    vence,
    fuente
  };

  if (detalle) {
    lookup.detalle = detalle;
  }

  return lookup;
}

function sandboxLookup(cedulaNum: string): ProviderLookup {
  const normalized = normalizeCedula(cedulaNum);
  if (normalized.includes("SUSP")) {
    return {
      estado: "suspendida",
      vence: addDays(180),
      detalle: "Cedula suspendida en sandbox BrokerGuard.",
      fuente: "sandbox"
    };
  }

  if (normalized.includes("CANC")) {
    return {
      estado: "cancelada",
      vence: addDays(-30),
      detalle: "Cedula cancelada en sandbox BrokerGuard.",
      fuente: "sandbox"
    };
  }

  if (normalized.includes("NR")) {
    return {
      estado: "no_registrada",
      vence: null,
      detalle: "Cedula no encontrada en sandbox BrokerGuard.",
      fuente: "sandbox"
    };
  }

  if (normalized.includes("VENC")) {
    return {
      estado: "vigente",
      vence: addDays(-1),
      detalle: "Cedula vencida en sandbox BrokerGuard.",
      fuente: "sandbox"
    };
  }

  if (normalized.includes("ERR")) {
    return {
      estado: "verificacion_pendiente",
      vence: null,
      detalle: "Falla tecnica simulada; no bloquea la operacion.",
      fuente: "fallback"
    };
  }

  return {
    estado: "vigente",
    vence: addDays(365),
    detalle: "Cedula vigente verificada por sandbox BrokerGuard.",
    fuente: "sandbox"
  };
}

export function createBrokerGuardAdapter(options: BrokerGuardAdapterOptions = {}): BrokerGuardAdapter {
  const mode = options.mode ?? "sandbox";
  const cache = options.cache ?? new MemoryTtlCache();
  const ttlSeconds = options.ttlSeconds ?? 24 * 60 * 60;
  const timeoutMs = options.timeoutMs ?? 3000;
  const retries = options.retries ?? 3;

  return {
    provider: "BrokerGuard",
    mode,

    async health(): Promise<IntegrationHealth> {
      return {
        provider: "BrokerGuard",
        mode,
        ok: mode === "sandbox" || (!!options.cnsfBaseUrl && !!options.amsfacBaseUrl),
        checkedAt: new Date().toISOString(),
        detail: mode === "sandbox" ? "Sandbox local activo." : "Modo real configurado por variables de entorno."
      };
    },

    async verify(params: BrokerGuardVerifyParams): Promise<BrokerGuardVerification> {
      const normalizedCedula = normalizeCedula(params.cedulaNum);
      const cacheKey = `brokerguard:${params.tenantId}:${normalizedCedula}`;
      const cached = await cache.get<BrokerGuardVerification>(cacheKey);
      if (cached) {
        return BrokerGuardVerificationSchema.parse({
          ...cached,
          originadorId: params.originadorId,
          fuente: "cache",
          verificadoEn: new Date().toISOString()
        });
      }

      try {
        const lookup =
          mode === "sandbox"
            ? sandboxLookup(normalizedCedula)
            : await retry(async () => {
                if (!options.cnsfBaseUrl || !options.amsfacBaseUrl) {
                  throw new Error("BrokerGuard real requiere CNSF_BASE_URL y AMSFAC_BASE_URL.");
                }

                try {
                  return await fetchProvider(options.cnsfBaseUrl, "cnsf", normalizedCedula, timeoutMs);
                } catch {
                  return await fetchProvider(options.amsfacBaseUrl, "amsfac", normalizedCedula, timeoutMs);
                }
              }, retries);

        const result = toVerification(params, lookup);
        await cache.set(cacheKey, result, ttlSeconds);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falla tecnica BrokerGuard.";
        const fallback = toVerification(
          params,
          {
            estado: "verificacion_pendiente",
            vence: params.cedulaVence ?? null,
            detalle: `${message} Fallback no bloqueante aplicado.`,
            fuente: "fallback"
          },
          "fallback"
        );
        await cache.set(cacheKey, fallback, Math.min(ttlSeconds, 15 * 60));
        return fallback;
      }
    }
  };
}
