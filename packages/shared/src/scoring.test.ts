import { describe, it, expect } from "vitest";
import {
  calcularScore,
  calcularScorePm,
  calcularScorePfC1,
  ScoringInputPmSchema,
  ScoringInputPfC1Schema,
  ScoringResultSchema,
  PM_WEIGHTS,
  PF_C1_WEIGHTS
} from "./scoring.js";

// ────────────────────────────────────────────────────────────
// Fixtures PM / PF C2
// ────────────────────────────────────────────────────────────

const PM_STRONG = {
  ruta: "PM" as const,
  liquidezCorriente: 2.0,
  solvenciaEndeudamiento: 0.3,
  rentabilidadRoe: 0.18,
  rentabilidadRoa: 0.12,
  expedientesAprobados: 5,
  expedientesRechazados: 0,
  sectorBenchmarkScore: 700
};

const PM_WEAK = {
  ruta: "PM" as const,
  liquidezCorriente: 0.4,
  solvenciaEndeudamiento: 1.2,
  rentabilidadRoe: -0.05,
  rentabilidadRoa: -0.08,
  expedientesAprobados: 0,
  expedientesRechazados: 3,
  sectorBenchmarkScore: 300
};

const PM_MEDIUM = {
  ruta: "PM" as const,
  liquidezCorriente: 1.2,
  solvenciaEndeudamiento: 0.6,
  rentabilidadRoe: 0.08,
  rentabilidadRoa: 0.05,
  expedientesAprobados: 2,
  expedientesRechazados: 1,
  sectorBenchmarkScore: 500
};

// ────────────────────────────────────────────────────────────
// Fixtures PF C1
// ────────────────────────────────────────────────────────────

const PF_STRONG = {
  ruta: "PF_C1" as const,
  patrimonioNeto: 3_000_000,
  montoSolicitado: 500_000,
  flujoBancarioMensual: 150_000,
  obligacionesMensuales: 40_000,
  valorActivosLiquidos: 2_000_000,
  valorActivosTotales: 3_500_000,
  expedientesAprobados: 3,
  expedientesRechazados: 0
};

const PF_WEAK = {
  ruta: "PF_C1" as const,
  patrimonioNeto: 100_000,
  montoSolicitado: 500_000,
  flujoBancarioMensual: 20_000,
  obligacionesMensuales: 50_000,
  valorActivosLiquidos: 10_000,
  valorActivosTotales: 150_000,
  expedientesAprobados: 0,
  expedientesRechazados: 2
};

const PF_MEDIUM = {
  ruta: "PF_C1" as const,
  patrimonioNeto: 800_000,
  montoSolicitado: 500_000,
  flujoBancarioMensual: 60_000,
  obligacionesMensuales: 35_000,
  valorActivosLiquidos: 300_000,
  valorActivosTotales: 900_000,
  expedientesAprobados: 1,
  expedientesRechazados: 1
};

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe("M5 Scoring Financiero", () => {
  describe("Schema validation", () => {
    it("validates PM input", () => {
      expect(ScoringInputPmSchema.safeParse(PM_STRONG).success).toBe(true);
    });

    it("validates PF C1 input", () => {
      expect(ScoringInputPfC1Schema.safeParse(PF_STRONG).success).toBe(true);
    });

    it("rejects invalid ruta", () => {
      const result = ScoringInputPmSchema.safeParse({ ...PM_STRONG, ruta: "INVALID" });
      expect(result.success).toBe(false);
    });
  });

  describe("Pesos suman 1.0", () => {
    it("PM weights sum to 1", () => {
      const sum = Object.values(PM_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
    });

    it("PF C1 weights sum to 1", () => {
      const sum = Object.values(PF_C1_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
    });
  });

  describe("Determinismo — mismos inputs, mismo score", () => {
    it("PM produce el mismo score en ejecuciones consecutivas", () => {
      const r1 = calcularScorePm(PM_STRONG);
      const r2 = calcularScorePm(PM_STRONG);
      expect(r1.score).toBe(r2.score);
      expect(r1.recomendacion).toBe(r2.recomendacion);
      for (let i = 0; i < r1.componentes.length; i++) {
        expect(r1.componentes[i].puntos).toBe(r2.componentes[i].puntos);
      }
    });

    it("PF C1 produce el mismo score en ejecuciones consecutivas", () => {
      const r1 = calcularScorePfC1(PF_STRONG);
      const r2 = calcularScorePfC1(PF_STRONG);
      expect(r1.score).toBe(r2.score);
      expect(r1.recomendacion).toBe(r2.recomendacion);
    });
  });

  describe("Recomendaciones correctas", () => {
    it("PM fuerte → sin_garantia (score >= 700)", () => {
      const result = calcularScorePm(PM_STRONG);
      expect(result.score).toBeGreaterThanOrEqual(700);
      expect(result.recomendacion).toBe("sin_garantia");
    });

    it("PM débil → garantia_inmobiliaria (score < 450)", () => {
      const result = calcularScorePm(PM_WEAK);
      expect(result.score).toBeLessThan(450);
      expect(result.recomendacion).toBe("garantia_inmobiliaria");
    });

    it("PM medio → obligado_solidario (450–699)", () => {
      const result = calcularScorePm(PM_MEDIUM);
      expect(result.score).toBeGreaterThanOrEqual(450);
      expect(result.score).toBeLessThan(700);
      expect(result.recomendacion).toBe("obligado_solidario");
    });

    it("PF fuerte → sin_garantia", () => {
      const result = calcularScorePfC1(PF_STRONG);
      expect(result.score).toBeGreaterThanOrEqual(700);
      expect(result.recomendacion).toBe("sin_garantia");
    });

    it("PF débil → garantia_inmobiliaria", () => {
      const result = calcularScorePfC1(PF_WEAK);
      expect(result.score).toBeLessThan(450);
      expect(result.recomendacion).toBe("garantia_inmobiliaria");
    });

    it("PF medio → obligado_solidario", () => {
      const result = calcularScorePfC1(PF_MEDIUM);
      expect(result.score).toBeGreaterThanOrEqual(450);
      expect(result.score).toBeLessThan(700);
      expect(result.recomendacion).toBe("obligado_solidario");
    });
  });

  describe("Output schema validation", () => {
    it("PM result passes ScoringResultSchema", () => {
      const result = calcularScorePm(PM_STRONG);
      const parsed = ScoringResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("PF result passes ScoringResultSchema", () => {
      const result = calcularScorePfC1(PF_STRONG);
      const parsed = ScoringResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe("Componentes de trazabilidad", () => {
    it("PM tiene 5 componentes con pesos correctos", () => {
      const result = calcularScorePm(PM_STRONG);
      expect(result.componentes).toHaveLength(5);
      const nombres = result.componentes.map((c) => c.nombre);
      expect(nombres).toContain("liquidez");
      expect(nombres).toContain("solvencia");
      expect(nombres).toContain("rentabilidad");
      expect(nombres).toContain("historial");
      expect(nombres).toContain("sector");
    });

    it("PF C1 tiene 4 componentes con pesos correctos", () => {
      const result = calcularScorePfC1(PF_STRONG);
      expect(result.componentes).toHaveLength(4);
      const nombres = result.componentes.map((c) => c.nombre);
      expect(nombres).toContain("patrimonioNeto");
      expect(nombres).toContain("flujoBancario");
      expect(nombres).toContain("calidadActivos");
      expect(nombres).toContain("historial");
    });

    it("guarda inputs usados para auditoria", () => {
      const result = calcularScorePm(PM_STRONG);
      expect(result.inputsUsados).toBeDefined();
      expect((result.inputsUsados as Record<string, unknown>).liquidezCorriente).toBe(2.0);
    });

    it("guarda pesos usados para auditoria", () => {
      const result = calcularScorePm(PM_STRONG);
      expect(result.pesosUsados).toEqual(PM_WEIGHTS);
    });
  });

  describe("Score boundaries 0–1000", () => {
    it("nunca excede 1000", () => {
      const extreme = {
        ruta: "PM" as const,
        liquidezCorriente: 2.0,
        solvenciaEndeudamiento: 0.0,
        rentabilidadRoe: 0.4,
        rentabilidadRoa: 0.4,
        expedientesAprobados: 50,
        expedientesRechazados: 0,
        sectorBenchmarkScore: 1000
      };
      const result = calcularScorePm(extreme);
      expect(result.score).toBeLessThanOrEqual(1000);
    });

    it("nunca es menor que 0", () => {
      const extreme = {
        ruta: "PM" as const,
        liquidezCorriente: 0,
        solvenciaEndeudamiento: 2.0,
        rentabilidadRoe: -0.3,
        rentabilidadRoa: -0.3,
        expedientesAprobados: 0,
        expedientesRechazados: 10,
        sectorBenchmarkScore: 0
      };
      const result = calcularScorePm(extreme);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("calcularScore dispatcher", () => {
    it("detecta ruta PM correctamente", () => {
      const result = calcularScore(PM_STRONG);
      expect(result.ruta).toBe("PM");
    });

    it("detecta ruta PF_C1 correctamente", () => {
      const result = calcularScore(PF_STRONG);
      expect(result.ruta).toBe("PF_C1");
    });
  });
});
