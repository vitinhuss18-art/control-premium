import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const domainMigration = readFileSync(
  resolve("supabase/migrations/202607240004_domain_schema.sql"),
  "utf8",
);
const authMigration = readFileSync(
  resolve("supabase/migrations/202607240005_auth_and_permissions.sql"),
  "utf8",
);

const tenantTables = [
  "client_contacts",
  "client_addresses",
  "client_documents",
  "credit_proposals",
  "loans",
  "installments",
  "payments",
  "collection_events",
  "renegotiations",
  "notifications",
  "contracts",
  "pix_transactions",
  "tenant_subscriptions",
  "idempotency_keys",
] as const;

describe("multi-tenant schema contract", () => {
  it.each(tenantTables)("%s possui tenant_id obrigatório", (tableName) => {
    const tableDefinition = new RegExp(
      `create table public\\.${tableName} \\([\\s\\S]*?\\n\\);`,
    ).exec(domainMigration)?.[0];

    expect(tableDefinition).toBeDefined();
    expect(tableDefinition).toContain(
      "tenant_id uuid not null references public.tenants",
    );
  });

  it("habilita RLS nas tabelas do domínio", () => {
    expect(domainMigration).toContain(
      "alter table public.%I enable row level security",
    );
    expect(domainMigration).toContain("public.current_tenant_id()");
    expect(domainMigration).toContain("public.is_super_admin()");
  });

  it("impõe vínculos compostos contra referências entre empresas", () => {
    expect(domainMigration).toContain("foreign key (tenant_id, client_id)");
    expect(domainMigration).toContain("foreign key (tenant_id, loan_id)");
    expect(domainMigration).toContain(
      "foreign key (tenant_id, installment_id)",
    );
  });

  it("mantém autenticação e autorização separadas de CPF", () => {
    expect(authMigration).toContain("add column if not exists cpf text");
    expect(authMigration).toContain("role_has_permission");
    expect(authMigration).not.toMatch(/password\s+text/i);
  });
});
