import type { RequestHandler } from "express";
import type { AppServices } from "../services/types.js";

export function auditAction(accion: string, entidad: string): RequestHandler {
  return (req, res, next) => {
    res.on("finish", () => {
      if (res.statusCode >= 400 || !req.usuario || !req.tenantId) {
        return;
      }

      const services = req.app.locals.services as AppServices;
      void services
        .recordAudit({
          tenantId: req.tenantId,
          usuarioId: req.usuario.id,
          entidad,
          entidadId: null,
          accion,
          datos: {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode
          }
        })
        .catch((error: unknown) => {
          console.error("No se pudo registrar auditoria automatica.", error);
        });
    });

    next();
  };
}
