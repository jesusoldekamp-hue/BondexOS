import { Router } from "express";
import { canReadTenantWide, OriginadorCreateRequestSchema } from "@bondexos/shared";
import { requireAuthenticatedTenant, requireRole } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import type { AppServices, OriginadorContext, UsuarioContext } from "../services/types.js";

export const originadoresRouter = Router();

function filterOriginadoresForUser(
  originadores: OriginadorContext[],
  usuarioId: string,
  rol: UsuarioContext["rol"]
) {
  if (canReadTenantWide(rol)) {
    return originadores;
  }

  return originadores.filter((originador) => originador.usuarioId === usuarioId);
}

originadoresRouter.get("/", ...requireAuthenticatedTenant, async (req, res, next) => {
  try {
    if (!req.tenantId || !req.usuario) {
      throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
    }

    const services = req.app.locals.services as AppServices;
    const originadores = await services.listOriginadoresByTenant(req.tenantId);
    res.json({
      originadores: filterOriginadoresForUser(originadores, req.usuario.id, req.usuario.rol)
    });
  } catch (error) {
    next(error);
  }
});

originadoresRouter.post(
  "/",
  ...requireAuthenticatedTenant,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId || !req.usuario) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const parsed = OriginadorCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "Payload de originador invalido.", "validation_error");
      }

      const services = req.app.locals.services as AppServices;
      const originador = await services.createOriginador({
        tenantId: req.tenantId,
        usuarioId: parsed.data.usuarioId,
        tipoOriginador: parsed.data.tipoOriginador,
        ...(parsed.data.cedulaNum ? { cedulaNum: parsed.data.cedulaNum } : {}),
        ...(parsed.data.cedulaEstado ? { cedulaEstado: parsed.data.cedulaEstado } : {}),
        ...(parsed.data.cedulaVence ? { cedulaVence: parsed.data.cedulaVence } : {}),
        ...(parsed.data.tipoAgente ? { tipoAgente: parsed.data.tipoAgente } : {})
      });

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "originador",
        entidadId: originador.id,
        accion: "originador.crear",
        datos: {
          tipoOriginador: originador.tipoOriginador,
          usuarioId: originador.usuarioId
        }
      });

      res.status(201).json({ originador });
    } catch (error) {
      next(error);
    }
  }
);

originadoresRouter.post(
  "/:originadorId/verify",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "suscriptor"]),
  async (req, res, next) => {
    try {
      if (!req.tenantId || !req.usuario) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const services = req.app.locals.services as AppServices;
      const originadorId = req.params.originadorId;
      if (!originadorId) {
        throw new HttpError(400, "Originador requerido.", "validation_error");
      }

      const verificacion = await services.verifyOriginador(req.tenantId, originadorId);

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "originador",
        entidadId: originadorId,
        accion: "brokerguard.verificar",
        datos: {
          estado: verificacion.estado,
          fuente: verificacion.fuente,
          bloqueaOperacion: verificacion.bloqueaOperacion
        }
      });

      res.json({ verificacion });
    } catch (error) {
      next(error);
    }
  }
);
