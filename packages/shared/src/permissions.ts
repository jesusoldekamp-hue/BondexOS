import type { UsuarioRol } from "./enums.js";

export const ADMIN_ROLES = ["admin"] as const satisfies readonly UsuarioRol[];
export const READ_ALL_TENANT_ROLES = [
  "admin",
  "suscriptor",
  "auditor"
] as const satisfies readonly UsuarioRol[];
export const MUTATING_ADMIN_ROLES = ["admin"] as const satisfies readonly UsuarioRol[];

export function hasRole(userRole: UsuarioRol, allowedRoles: readonly UsuarioRol[]): boolean {
  return allowedRoles.includes(userRole);
}

export function canReadTenantWide(userRole: UsuarioRol): boolean {
  return hasRole(userRole, READ_ALL_TENANT_ROLES);
}

export function canInviteUsers(userRole: UsuarioRol): boolean {
  return hasRole(userRole, ADMIN_ROLES);
}
