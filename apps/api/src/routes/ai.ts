import { Router } from "express";
import { AiJobRequestSchema } from "@bondexos/shared";
import { requireAuthenticatedTenant, requireRole } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import type { AppServices } from "../services/types.js";

export const aiRouter = Router();

aiRouter.post(
  "/jobs",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId || !req.usuario) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const parsed = AiJobRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "Payload de job IA invalido.", "validation_error");
      }

      const services = req.app.locals.services as AppServices;
      const job = await services.enqueueAiJob({
        tenantId: req.tenantId,
        createdBy: req.usuario.id,
        expedienteId: parsed.data.expedienteId,
        tipo: parsed.data.tipo,
        ...(parsed.data.documentoId ? { documentoId: parsed.data.documentoId } : {})
      });

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "ai_job",
        entidadId: job.id,
        accion: "ia.encolar",
        datos: {
          expedienteId: job.expedienteId,
          documentoId: job.documentoId,
          tipo: job.tipo
        }
      });

      res.status(201).json({ job });
    } catch (error) {
      next(error);
    }
  }
);

aiRouter.get(
  "/expedientes/:expedienteId/jobs",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor", "auditor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const expedienteId = req.params.expedienteId;
      if (!expedienteId) {
        throw new HttpError(400, "Expediente requerido.", "validation_error");
      }

      const services = req.app.locals.services as AppServices;
      const jobs = await services.listAiJobsByExpediente(req.tenantId, expedienteId);
      res.json({ jobs });
    } catch (error) {
      next(error);
    }
  }
);
