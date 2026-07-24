export const roles = [
  "super_admin",
  "admin",
  "manager",
  "operator",
  "collector",
  "client",
] as const;

export type AppRole = (typeof roles)[number];

export const permissions = [
  "tenant.manage",
  "members.manage",
  "clients.read",
  "clients.write",
  "proposals.read",
  "proposals.write",
  "proposals.approve",
  "collections.manage",
  "finance.read",
  "finance.write",
  "finance.reverse",
  "portal.read",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Readonly<Record<AppRole, ReadonlySet<Permission>>> = {
  super_admin: new Set(permissions),
  admin: new Set([
    "tenant.manage",
    "members.manage",
    "clients.read",
    "clients.write",
    "proposals.read",
    "proposals.write",
    "proposals.approve",
    "collections.manage",
    "finance.read",
    "finance.write",
    "finance.reverse",
  ]),
  manager: new Set([
    "members.manage",
    "clients.read",
    "clients.write",
    "proposals.read",
    "proposals.write",
    "proposals.approve",
    "collections.manage",
    "finance.read",
    "finance.write",
  ]),
  operator: new Set([
    "clients.read",
    "clients.write",
    "proposals.read",
    "proposals.write",
    "finance.read",
  ]),
  collector: new Set(["clients.read", "collections.manage", "finance.read"]),
  client: new Set(["portal.read"]),
};

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
