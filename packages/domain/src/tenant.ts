export class TenantAccessError extends Error {
  constructor() {
    super("Acesso negado para dados de outra empresa.");
    this.name = "TenantAccessError";
  }
}

export function assertTenantAccess(
  sessionTenantId: string,
  resourceTenantId: string,
): void {
  if (!sessionTenantId || sessionTenantId !== resourceTenantId) {
    throw new TenantAccessError();
  }
}
