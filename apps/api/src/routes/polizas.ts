import { Router } from "express";
import { requireAuthenticatedTenant, requireRole } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import type { AppServices } from "../services/types.js";

export const polizasRouter = Router();

// GET /api/v1/polizas — listar pólizas del tenant
polizasRouter.get("/", ...requireAuthenticatedTenant, async (req, res, next) => {
  try {
    if (!req.tenantId) {
      throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
    }

    const services = req.app.locals.services as AppServices;
    const polizas = await services.listPolizasByTenant(req.tenantId);
    res.json({ polizas });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/polizas/:polizaId — detalle de póliza
polizasRouter.get("/:polizaId", ...requireAuthenticatedTenant, async (req, res, next) => {
  try {
    if (!req.tenantId) {
      throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
    }

    const polizaId = req.params.polizaId;
    if (!polizaId) {
      throw new HttpError(400, "Poliza requerida.", "validation_error");
    }

    const services = req.app.locals.services as AppServices;
    const poliza = await services.getPolizaById(req.tenantId, polizaId);
    if (!poliza) {
      throw new HttpError(404, "Poliza no encontrada.", "poliza_not_found");
    }

    res.json({ poliza });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/polizas/:polizaId/pdf — URL firmada del PDF
polizasRouter.get("/:polizaId/pdf", ...requireAuthenticatedTenant, async (req, res, next) => {
  try {
    if (!req.tenantId) {
      throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
    }

    const polizaId = req.params.polizaId;
    if (!polizaId) {
      throw new HttpError(400, "Poliza requerida.", "validation_error");
    }

    const services = req.app.locals.services as AppServices;
    const poliza = await services.getPolizaById(req.tenantId, polizaId);
    if (!poliza) {
      throw new HttpError(404, "Poliza no encontrada.", "poliza_not_found");
    }

    if (!poliza.pdfR2Url) {
      throw new HttpError(404, "PDF no disponible. Poliza aun no emitida.", "pdf_not_available");
    }

    res.json({
      url: poliza.pdfR2Url,
      key: poliza.pdfR2Key,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/polizas/emitir/:expedienteId — disparar emisión manual
polizasRouter.post(
  "/emitir/:expedienteId",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId || !req.usuario) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const expedienteId = req.params.expedienteId;
      if (!expedienteId) {
        throw new HttpError(400, "Expediente requerido.", "validation_error");
      }

      const services = req.app.locals.services as AppServices;

      // Check idempotency
      const existing = await services.getPolizaByExpedienteId(req.tenantId, expedienteId);
      if (existing) {
        throw new HttpError(409, "Ya existe una poliza para este expediente.", "poliza_exists");
      }

      // Check expediente
      const detail = await services.getExpedienteDetail(req.tenantId, expedienteId);
      if (!detail) {
        throw new HttpError(404, "Expediente no encontrado.", "expediente_not_found");
      }

      // Check decision aprobada
      const decisiones = await services.getDecisionsByExpediente(req.tenantId, expedienteId);
      const aprobacion = decisiones.find(
        (d) => d.decision === "aprobado" || d.decision === "aprobado_con_condiciones"
      );
      if (!aprobacion) {
        throw new HttpError(400, "No hay decision aprobada para este expediente.", "no_aprobacion");
      }

      // Check documentos obligatorios
      const docsNoValidados = detail.documentos.filter((d) => d.obligatorio && d.estado !== "validado");
      if (docsNoValidados.length > 0) {
        throw new HttpError(400, "Documentos obligatorios sin validar.", "documentos_pendientes");
      }

      const poliza = await services.emitirPoliza({
        tenantId: req.tenantId,
        expedienteId,
        decision: aprobacion.decision,
        condiciones: aprobacion.condiciones
      });

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "poliza",
        entidadId: poliza.id,
        accion: "poliza.emitir",
        datos: {
          numeroPoliza: poliza.numeroPoliza,
          monto: poliza.monto,
          cfdiUuid: poliza.cfdiUuid
        }
      });

      res.status(201).json({ poliza });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/monitoreo/status — estado de workers y DLQ
polizasRouter.get(
  "/monitoreo/status",
  ...requireAuthenticatedTenant,
  requireRole(["admin"]),
  async (_req, res, next) => {
    try {
      // Import worker status dynamically
      const { getWorkerRuntimeStatus, getDlqEntries } = await import("@bondexos/workers");
      const status = getWorkerRuntimeStatus();
      const dlq = getDlqEntries();
      res.json({ status, dlqCount: dlq.length, dlq: dlq.slice(-20) });
    } catch (error) {
      next(error);
    }
  }
);
