import { Router } from "express";
import { InvitationRequestSchema } from "@bondexos/shared";
import { auditAction } from "../middleware/audit.js";
import {
  requireAuthenticatedTenant,
  requireRole
} from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import type { AppServices } from "../services/types.js";

export const adminRouter = Router();

adminRouter.get(
  "/users",
  ...requireAuthenticatedTenant,
  requireRole(["admin", "auditor"]),
  async (req, res, next) => {
    try {
      const services = req.app.locals.services as AppServices;
      const users = await services.listUsersByTenant(req.tenantId ?? "");
      res.json({ users });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.post(
  "/invitations",
  ...requireAuthenticatedTenant,
  requireRole(["admin"]),
  auditAction("usuario.invitar", "usuario"),
  async (req, res, next) => {
    try {
      const parsed = InvitationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "Payload de invitacion invalido.", "validation_error");
      }

      if (!req.usuario || !req.tenantId) {
        throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
      }

      const services = req.app.locals.services as AppServices;
      const redirectTo = `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/auth/callback`;
      const invitedUser = await services.inviteUser({
        ...parsed.data,
        tenantId: req.tenantId,
        invitedByUsuarioId: req.usuario.id,
        redirectTo
      });

      await services.recordAudit({
        tenantId: req.tenantId,
        usuarioId: req.usuario.id,
        entidad: "usuario",
        entidadId: invitedUser.id,
        accion: "usuario.invitar",
        datos: {
          email: invitedUser.email,
          rol: invitedUser.rol
        }
      });

      res.status(201).json({ user: invitedUser });
    } catch (error) {
      next(error);
    }
  }
);
