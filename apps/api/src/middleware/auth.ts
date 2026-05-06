import type { RequestHandler } from "express";
import type { UsuarioRol } from "@bondexos/shared";
import { hasRole } from "@bondexos/shared";
import { HttpError } from "./errors.js";
import type { AppServices } from "../services/types.js";

function getServices(req: Parameters<RequestHandler>[0]): AppServices {
  return req.app.locals.services as AppServices;
}

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = getBearerToken(req.header("authorization"));
    if (!token) {
      throw new HttpError(401, "Token de autenticacion requerido.", "auth_required");
    }

    const services = getServices(req);
    const authUser = await services.validateToken(token);
    if (!authUser) {
      throw new HttpError(401, "Token de autenticacion invalido.", "auth_invalid");
    }

    const usuario = await services.getUsuarioByAuthUserId(authUser.id);
    if (!usuario) {
      throw new HttpError(403, "Usuario no registrado en BondexOS.", "user_not_registered");
    }

    req.authUser = authUser;
    req.usuario = usuario;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireActiveUser: RequestHandler = (req, _res, next) => {
  if (!req.usuario) {
    next(new HttpError(401, "Usuario autenticado requerido.", "auth_required"));
    return;
  }

  if (!req.usuario.activo) {
    next(new HttpError(403, "Usuario inactivo.", "user_inactive"));
    return;
  }

  next();
};

export const requireTenant: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.usuario) {
      throw new HttpError(401, "Usuario autenticado requerido.", "auth_required");
    }

    const services = getServices(req);
    const tenant = await services.getTenantById(req.usuario.tenantId);
    if (!tenant) {
      throw new HttpError(403, "Tenant no encontrado.", "tenant_not_found");
    }

    req.tenant = tenant;
    req.tenantId = tenant.id;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(allowedRoles: readonly UsuarioRol[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario) {
      next(new HttpError(401, "Usuario autenticado requerido.", "auth_required"));
      return;
    }

    if (!hasRole(req.usuario.rol, allowedRoles)) {
      next(new HttpError(403, "Permisos insuficientes.", "forbidden"));
      return;
    }

    next();
  };
}

export const requireAuthenticatedTenant = [
  requireAuth,
  requireActiveUser,
  requireTenant
] as const;
