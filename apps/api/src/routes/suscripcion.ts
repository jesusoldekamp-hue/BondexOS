import { Router } from "express";
import { DecisionRequestSchema } from "@bondexos/shared";
import { requireAuthenticatedTenant, requireRole } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import type { AppServices, UsuarioContext } from "../services/types.js";

export const suscripcionRouter = Router();

// GET /api/v1/suscripcion/cola — expedientes listos para suscripción
suscripcionRouter.get(
  "/cola",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const services = req.app.locals.services as AppServices;
      const expedientes = await services.listExpedientesForSuscripcion(req.tenantId);
      res.json({ expedientes });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/expedientes/:expedienteId/score — calcular score
suscripcionRouter.post(
  "/expedientes/:expedienteId/score",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId || !req.usuario) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const services = req.app.locals.services as AppServices;
      const expedienteId = req.params.expedienteId;
      if (!expedienteId) {
        throw new HttpError(400, "Expediente requerido.", "validation_error");
      }

      const detail = await services.getExpedienteDetail(req.tenantId, expedienteId);
      if (!detail) {
        throw new HttpError(404, "Expediente no encontrado.", "expediente_not_found");
      }

      const result = await services.calculateScore(req.tenantId, expedienteId);

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "analisis_financiero",
        entidadId: expedienteId,
        accion: "scoring.calcular",
        datos: {
          ruta: result.ruta,
          score: result.score,
          recomendacion: result.recomendacion,
          componentes: result.componentes.map((c) => ({
            nombre: c.nombre,
            peso: c.peso,
            puntos: c.puntos
          }))
        }
      });

      res.json({ scoring: result });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/expedientes/:expedienteId/score — consultar score existente
suscripcionRouter.get(
  "/expedientes/:expedienteId/score",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor", "auditor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const services = req.app.locals.services as AppServices;
      const expedienteId = req.params.expedienteId;
      if (!expedienteId) {
        throw new HttpError(400, "Expediente requerido.", "validation_error");
      }

      const analisis = await services.getScore(req.tenantId, expedienteId);
      if (!analisis) {
        throw new HttpError(404, "Score no encontrado. Ejecute el calculo primero.", "score_not_found");
      }

      res.json({ analisis });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/expedientes/:expedienteId/decision — decidir sobre expediente
suscripcionRouter.post(
  "/expedientes/:expedienteId/decision",
  ...requireAuthenticatedTenant,
  requireRole(["suscriptor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId || !req.usuario) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const expedienteId = req.params.expedienteId;
      if (!expedienteId) {
        throw new HttpError(400, "Expediente requerido.", "validation_error");
      }

      const parsed = DecisionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join("; ");
        throw new HttpError(400, message, "validation_error");
      }

      const services = req.app.locals.services as AppServices;

      // Verificar que el expediente existe y tiene score
      const detail = await services.getExpedienteDetail(req.tenantId, expedienteId);
      if (!detail) {
        throw new HttpError(404, "Expediente no encontrado.", "expediente_not_found");
      }

      if (detail.expediente.score === null) {
        throw new HttpError(400, "No se puede decidir sin score calculado (M5).", "score_required");
      }

      // Verificar documentos obligatorios validados
      const docsObligatorios = detail.documentos.filter((d) => d.obligatorio);
      const docsNoValidados = docsObligatorios.filter((d) => d.estado !== "validado");
      if (docsNoValidados.length > 0) {
        throw new HttpError(
          400,
          `Hay ${docsNoValidados.length} documento(s) obligatorio(s) sin validar.`,
          "documentos_pendientes"
        );
      }

      const decision = await services.createDecision({
        tenantId: req.tenantId,
        expedienteId,
        suscriptorId: req.usuario.id,
        decision: parsed.data.decision,
        ...(parsed.data.condiciones ? { condiciones: parsed.data.condiciones } : {}),
        ...(parsed.data.motivoRechazo ? { motivoRechazo: parsed.data.motivoRechazo } : {}),
        ...(parsed.data.montoAprobado ? { montoAprobado: parsed.data.montoAprobado } : {})
      });

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "decision_suscripcion",
        entidadId: decision.id,
        accion: `suscripcion.${decision.decision}`,
        datos: {
          expedienteId,
          decision: decision.decision,
          condiciones: decision.condiciones,
          motivoRechazo: decision.motivoRechazo
        }
      });

      res.status(201).json({ decision });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/expedientes/:expedienteId/decisiones — historial de decisiones
suscripcionRouter.get(
  "/expedientes/:expedienteId/decisiones",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor", "auditor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const services = req.app.locals.services as AppServices;
      const expedienteId = req.params.expedienteId;
      if (!expedienteId) {
        throw new HttpError(400, "Expediente requerido.", "validation_error");
      }

      const decisiones = await services.getDecisionsByExpediente(req.tenantId, expedienteId);
      res.json({ decisiones });
    } catch (error) {
      next(error);
    }
  }
);
