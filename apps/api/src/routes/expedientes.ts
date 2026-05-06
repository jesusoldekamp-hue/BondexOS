import { Router } from "express";
import {
  DocumentoStatusUpdateRequestSchema,
  DocumentoUploadUrlRequestSchema,
  ExpedienteCreateRequestSchema
} from "@bondexos/shared";
import { requireAuthenticatedTenant, requireRole } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import type { AppServices, ExpedienteDetail, UsuarioContext } from "../services/types.js";

export const expedientesRouter = Router();

function canReadTenantWide(rol: UsuarioContext["rol"]): boolean {
  return rol === "admin" || rol === "suscriptor" || rol === "auditor";
}

async function assertExpedienteAccess(
  services: AppServices,
  tenantId: string,
  usuario: UsuarioContext,
  detail: ExpedienteDetail | null
): Promise<ExpedienteDetail> {
  if (!detail) {
    throw new HttpError(404, "Expediente no encontrado.", "expediente_not_found");
  }

  if (canReadTenantWide(usuario.rol) || detail.expediente.clienteUsuarioId === usuario.id) {
    return detail;
  }

  const originador = await services.getOriginadorById(tenantId, detail.expediente.originadorId);
  if (originador?.usuarioId === usuario.id) {
    return detail;
  }

  throw new HttpError(403, "Permisos insuficientes para este expediente.", "forbidden");
}

expedientesRouter.get("/", ...requireAuthenticatedTenant, async (req, res, next) => {
  try {
    if (!req.tenantId || !req.usuario) {
      throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
    }

    const services = req.app.locals.services as AppServices;
    const expedientes = await services.listExpedientesByTenant(req.tenantId, req.usuario);
    res.json({ expedientes });
  } catch (error) {
    next(error);
  }
});

expedientesRouter.post(
  "/",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor", "broker", "vendedor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId || !req.usuario || !req.tenant) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const parsed = ExpedienteCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "Payload de expediente invalido.", "validation_error");
      }

      const services = req.app.locals.services as AppServices;
      const detail = await services.createExpediente({
        tenantId: req.tenantId,
        tenantConfig: req.tenant.config,
        originadorId: parsed.data.originadorId,
        clienteRfc: parsed.data.clienteRfc,
        tipoSolicitante: parsed.data.tipoSolicitante,
        tipoFianza: parsed.data.tipoFianza,
        montoSolicitado: parsed.data.montoSolicitado,
        ...(parsed.data.clienteUsuarioId ? { clienteUsuarioId: parsed.data.clienteUsuarioId } : {}),
        ...(parsed.data.pfRutaCapacidad ? { pfRutaCapacidad: parsed.data.pfRutaCapacidad } : {}),
        ...(parsed.data.pfEstadoCivil ? { pfEstadoCivil: parsed.data.pfEstadoCivil } : {})
      });

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "expediente",
        entidadId: detail.expediente.id,
        accion: "expediente.crear",
        datos: {
          tipoSolicitante: detail.expediente.tipoSolicitante,
          tipoFianza: detail.expediente.tipoFianza,
          documentos: detail.documentos.length
        }
      });

      res.status(201).json(detail);
    } catch (error) {
      next(error);
    }
  }
);

expedientesRouter.get("/:expedienteId", ...requireAuthenticatedTenant, async (req, res, next) => {
  try {
    if (!req.tenantId || !req.usuario) {
      throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
    }

    const services = req.app.locals.services as AppServices;
    const expedienteId = req.params.expedienteId;
    if (!expedienteId) {
      throw new HttpError(400, "Expediente requerido.", "validation_error");
    }

    const detail = await assertExpedienteAccess(
      services,
      req.tenantId,
      req.usuario,
      await services.getExpedienteDetail(req.tenantId, expedienteId)
    );

    res.json(detail);
  } catch (error) {
    next(error);
  }
});

expedientesRouter.post(
  "/:expedienteId/submit",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor", "broker", "vendedor"]),
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

      await assertExpedienteAccess(
        services,
        req.tenantId,
        req.usuario,
        await services.getExpedienteDetail(req.tenantId, expedienteId)
      );
      const detail = await services.submitExpediente(req.tenantId, expedienteId);

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "expediente",
        entidadId: detail.expediente.id,
        accion: "expediente.enviar_suscripcion",
        datos: {
          progresoObligatorio: detail.expediente.progresoObligatorio
        }
      });

      res.json(detail);
    } catch (error) {
      next(error);
    }
  }
);

expedientesRouter.post(
  "/:expedienteId/documentos/:documentoId/upload-url",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor", "broker", "vendedor", "cliente"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId || !req.usuario) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const parsed = DocumentoUploadUrlRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "Payload de carga invalido.", "validation_error");
      }

      const services = req.app.locals.services as AppServices;
      const expedienteId = req.params.expedienteId;
      const documentoId = req.params.documentoId;
      if (!expedienteId || !documentoId) {
        throw new HttpError(400, "Expediente y documento requeridos.", "validation_error");
      }

      await assertExpedienteAccess(
        services,
        req.tenantId,
        req.usuario,
        await services.getExpedienteDetail(req.tenantId, expedienteId)
      );

      const upload = await services.createDocumentUploadUrl({
        tenantId: req.tenantId,
        expedienteId,
        documentoId,
        filename: parsed.data.filename,
        contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes
      });

      res.json({ upload });
    } catch (error) {
      next(error);
    }
  }
);

expedientesRouter.patch(
  "/:expedienteId/documentos/:documentoId",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor", "broker", "vendedor", "cliente"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId || !req.usuario) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const parsed = DocumentoStatusUpdateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "Payload de documento invalido.", "validation_error");
      }

      if (
        parsed.data.estado !== "cargado" &&
        req.usuario.rol !== "admin" &&
        req.usuario.rol !== "suscriptor"
      ) {
        throw new HttpError(403, "Solo admin o suscriptor validan/rechazan documentos.", "forbidden");
      }

      const services = req.app.locals.services as AppServices;
      const expedienteId = req.params.expedienteId;
      const documentoId = req.params.documentoId;
      if (!expedienteId || !documentoId) {
        throw new HttpError(400, "Expediente y documento requeridos.", "validation_error");
      }

      await assertExpedienteAccess(
        services,
        req.tenantId,
        req.usuario,
        await services.getExpedienteDetail(req.tenantId, expedienteId)
      );

      const documento = await services.updateDocumento({
        tenantId: req.tenantId,
        expedienteId,
        documentoId,
        estado: parsed.data.estado,
        ...(parsed.data.urlR2 ? { urlR2: parsed.data.urlR2 } : {}),
        ...(parsed.data.r2Key ? { r2Key: parsed.data.r2Key } : {}),
        ...(parsed.data.sizeBytes ? { sizeBytes: parsed.data.sizeBytes } : {}),
        ...(parsed.data.datosExtraidosJson ? { datosExtraidosJson: parsed.data.datosExtraidosJson } : {}),
        ...(parsed.data.fuenteValidacion ? { fuenteValidacion: parsed.data.fuenteValidacion } : {}),
        ...(parsed.data.rechazadoMotivo ? { rechazadoMotivo: parsed.data.rechazadoMotivo } : {})
      });

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "documento",
        entidadId: documento.id,
        accion: `documento.${documento.estado}`,
        datos: {
          expedienteId: documento.expedienteId,
          tipo: documento.tipo
        }
      });

      res.json({ documento });
    } catch (error) {
      next(error);
    }
  }
);
