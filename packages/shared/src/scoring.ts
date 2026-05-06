import { z } from "zod";
import type { Recomendacion } from "./enums.js";

// ────────────────────────────────────────────────────────────
// Pesos — Ruta PM / PF C2 (estados financieros formales)
// ────────────────────────────────────────────────────────────
export const PM_WEIGHTS = {
  liquidez: 0.25,
  solvencia: 0.25,
  rentabilidad: 0.20,
  historial: 0.20,
  sector: 0.10
} as const;

// ────────────────────────────────────────────────────────────
// Pesos — Ruta PF C1 (patrimonial)
// ────────────────────────────────────────────────────────────
export const PF_C1_WEIGHTS = {
  patrimonioNeto: 0.35,
  flujoBancario: 0.30,
  calidadActivos: 0.20,
  historial: 0.15
} as const;

// ────────────────────────────────────────────────────────────
// Schemas de entrada
// ────────────────────────────────────────────────────────────
export const ScoringInputPmSchema = z.object({
  ruta: z.literal("PM"),
  liquidezCorriente: z.number().min(0),
  solvenciaEndeudamiento: z.number().min(0),
  rentabilidadRoe: z.number(),
  rentabilidadRoa: z.number(),
  expedientesAprobados: z.number().int().min(0).default(0),
  expedientesRechazados: z.number().int().min(0).default(0),
  sectorBenchmarkScore: z.number().min(0).max(1000).default(500)
});

export const ScoringInputPfC1Schema = z.object({
  ruta: z.literal("PF_C1"),
  patrimonioNeto: z.number(),
  montoSolicitado: z.number().positive(),
  flujoBancarioMensual: z.number().min(0),
  obligacionesMensuales: z.number().min(0),
  valorActivosLiquidos: z.number().min(0),
  valorActivosTotales: z.number().min(0),
  expedientesAprobados: z.number().int().min(0).default(0),
  expedientesRechazados: z.number().int().min(0).default(0)
});

export const ScoringInputSchema = z.discriminatedUnion("ruta", [
  ScoringInputPmSchema,
  ScoringInputPfC1Schema
]);

export type ScoringInputPm = z.infer<typeof ScoringInputPmSchema>;
export type ScoringInputPfC1 = z.infer<typeof ScoringInputPfC1Schema>;
export type ScoringInput = z.infer<typeof ScoringInputSchema>;

// ────────────────────────────────────────────────────────────
// Schema de salida
// ────────────────────────────────────────────────────────────
export const ScoringComponentSchema = z.object({
  nombre: z.string(),
  peso: z.number(),
  valorBruto: z.number(),
  valorNormalizado: z.number().min(0).max(1000),
  puntos: z.number()
});

export const ScoringResultSchema = z.object({
  ruta: z.enum(["PM", "PF_C1"]),
  score: z.number().int().min(0).max(1000),
  recomendacion: z.enum(["sin_garantia", "obligado_solidario", "garantia_inmobiliaria"]),
  componentes: z.array(ScoringComponentSchema),
  pesosUsados: z.record(z.number()),
  inputsUsados: z.record(z.unknown()),
  calculadoEn: z.string().datetime()
});

export type ScoringComponent = z.infer<typeof ScoringComponentSchema>;
export type ScoringResult = z.infer<typeof ScoringResultSchema>;

// ────────────────────────────────────────────────────────────
// Funciones de normalización (0–1000)
// ────────────────────────────────────────────────────────────

/** Clamp a value between 0 and 1000 */
function clamp(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

/**
 * Liquidez corriente ideal: 1.5–2.5.
 * < 0.5 → 0, 1.5 → 750, 2.0 → 1000, > 3.5 → 600 (exceso = ineficiencia).
 */
function normalizeLiquidez(ratio: number): number {
  if (ratio <= 0) return 0;
  if (ratio < 0.5) return clamp(ratio * 200);
  if (ratio <= 2.0) return clamp(333 + ((ratio - 0.5) / 1.5) * 667);
  if (ratio <= 3.5) return clamp(1000 - ((ratio - 2.0) / 1.5) * 400);
  return 600;
}

/**
 * Solvencia (pasivo/activo). Ideal: 0.2–0.5. Mayor es peor.
 * 0 → 1000, 0.5 → 700, 1.0 → 300, >1.5 → 0.
 */
function normalizeSolvencia(ratio: number): number {
  if (ratio <= 0) return 1000;
  if (ratio <= 0.5) return clamp(1000 - ratio * 600);
  if (ratio <= 1.0) return clamp(700 - (ratio - 0.5) * 800);
  if (ratio <= 1.5) return clamp(300 - (ratio - 1.0) * 600);
  return 0;
}

/**
 * Rentabilidad promedio ROE/ROA. Rango: -0.2 a +0.4.
 * <-0.2 → 0, 0 → 400, 0.15 → 750, 0.3+ → 1000.
 */
function normalizeRentabilidad(roe: number, roa: number): number {
  const avg = (roe + roa) / 2;
  if (avg <= -0.2) return 0;
  if (avg <= 0) return clamp(((avg + 0.2) / 0.2) * 400);
  if (avg <= 0.15) return clamp(400 + (avg / 0.15) * 350);
  if (avg <= 0.3) return clamp(750 + ((avg - 0.15) / 0.15) * 250);
  return 1000;
}

/**
 * Historial en plataforma.
 * Score basado en aprobados vs total. Sin expedientes → 500 (neutro).
 */
function normalizeHistorial(aprobados: number, rechazados: number): number {
  const total = aprobados + rechazados;
  if (total === 0) return 500;
  const ratio = aprobados / total;
  const base = clamp(ratio * 900);
  const bonus = Math.min(total, 10) * 10;
  return clamp(base + bonus);
}

/**
 * Patrimonio neto vs monto solicitado.
 * ratio >= 3 → 1000, ratio 1 → 500, ratio < 0.3 → 0.
 */
function normalizePatrimonioNeto(patrimonioNeto: number, montoSolicitado: number): number {
  if (montoSolicitado <= 0 || patrimonioNeto <= 0) return 0;
  const ratio = patrimonioNeto / montoSolicitado;
  if (ratio >= 3) return 1000;
  if (ratio <= 0.3) return clamp(ratio * 333);
  return clamp(((ratio - 0.3) / 2.7) * 1000);
}

/**
 * Flujo bancario vs obligaciones.
 * Cobertura >= 3 → 1000, 1.0 → 500, < 0.5 → 0.
 */
function normalizeFlujoBancario(flujo: number, obligaciones: number): number {
  if (flujo <= 0) return 0;
  if (obligaciones <= 0) return 1000;
  const cobertura = flujo / obligaciones;
  if (cobertura >= 3) return 1000;
  if (cobertura < 0.5) return clamp(cobertura * 200);
  return clamp(((cobertura - 0.5) / 2.5) * 1000);
}

/**
 * Calidad de activos: porcentaje de activos líquidos.
 * 80%+ → 1000, 50% → 700, 20% → 300, <5% → 0.
 */
function normalizeCalidadActivos(liquidos: number, totales: number): number {
  if (totales <= 0 || liquidos <= 0) return 0;
  const pct = liquidos / totales;
  if (pct >= 0.8) return 1000;
  if (pct >= 0.5) return clamp(700 + ((pct - 0.5) / 0.3) * 300);
  if (pct >= 0.2) return clamp(300 + ((pct - 0.2) / 0.3) * 400);
  if (pct >= 0.05) return clamp((pct / 0.2) * 300);
  return 0;
}

// ────────────────────────────────────────────────────────────
// Motor de scoring
// ────────────────────────────────────────────────────────────

function scoreToRecomendacion(score: number): Recomendacion {
  if (score >= 700) return "sin_garantia";
  if (score >= 450) return "obligado_solidario";
  return "garantia_inmobiliaria";
}

function buildComponent(nombre: string, peso: number, valorBruto: number, valorNormalizado: number): ScoringComponent {
  return {
    nombre,
    peso,
    valorBruto: Math.round(valorBruto * 10000) / 10000,
    valorNormalizado: clamp(valorNormalizado),
    puntos: Math.round(peso * clamp(valorNormalizado))
  };
}

export function calcularScorePm(input: ScoringInputPm): ScoringResult {
  const w = PM_WEIGHTS;

  const liquidez = buildComponent("liquidez", w.liquidez, input.liquidezCorriente, normalizeLiquidez(input.liquidezCorriente));
  const solvencia = buildComponent("solvencia", w.solvencia, input.solvenciaEndeudamiento, normalizeSolvencia(input.solvenciaEndeudamiento));
  const rentabilidad = buildComponent("rentabilidad", w.rentabilidad, (input.rentabilidadRoe + input.rentabilidadRoa) / 2, normalizeRentabilidad(input.rentabilidadRoe, input.rentabilidadRoa));
  const historial = buildComponent("historial", w.historial, input.expedientesAprobados, normalizeHistorial(input.expedientesAprobados, input.expedientesRechazados));
  const sector = buildComponent("sector", w.sector, input.sectorBenchmarkScore, input.sectorBenchmarkScore);

  const componentes = [liquidez, solvencia, rentabilidad, historial, sector];
  const score = clamp(componentes.reduce((sum, c) => sum + c.puntos, 0));

  return ScoringResultSchema.parse({
    ruta: "PM",
    score,
    recomendacion: scoreToRecomendacion(score),
    componentes,
    pesosUsados: { ...w },
    inputsUsados: { ...input },
    calculadoEn: new Date().toISOString()
  });
}

export function calcularScorePfC1(input: ScoringInputPfC1): ScoringResult {
  const w = PF_C1_WEIGHTS;

  const patrimonio = buildComponent("patrimonioNeto", w.patrimonioNeto, input.patrimonioNeto, normalizePatrimonioNeto(input.patrimonioNeto, input.montoSolicitado));
  const flujo = buildComponent("flujoBancario", w.flujoBancario, input.flujoBancarioMensual, normalizeFlujoBancario(input.flujoBancarioMensual, input.obligacionesMensuales));
  const activos = buildComponent("calidadActivos", w.calidadActivos, input.valorActivosLiquidos, normalizeCalidadActivos(input.valorActivosLiquidos, input.valorActivosTotales));
  const historial = buildComponent("historial", w.historial, input.expedientesAprobados, normalizeHistorial(input.expedientesAprobados, input.expedientesRechazados));

  const componentes = [patrimonio, flujo, activos, historial];
  const score = clamp(componentes.reduce((sum, c) => sum + c.puntos, 0));

  return ScoringResultSchema.parse({
    ruta: "PF_C1",
    score,
    recomendacion: scoreToRecomendacion(score),
    componentes,
    pesosUsados: { ...w },
    inputsUsados: { ...input },
    calculadoEn: new Date().toISOString()
  });
}

/**
 * Punto de entrada principal: detecta la ruta y delega.
 */
export function calcularScore(input: ScoringInput): ScoringResult {
  if (input.ruta === "PM") {
    return calcularScorePm(input);
  }

  return calcularScorePfC1(input);
}
