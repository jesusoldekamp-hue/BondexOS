import type { AuthUser, TenantContext, UsuarioContext } from "../services/types.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      usuario?: UsuarioContext;
      tenant?: TenantContext;
      tenantId?: string;
    }
  }
}

export {};
