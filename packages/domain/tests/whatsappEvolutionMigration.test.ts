import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260812015732_tenant_whatsapp_evolution.sql"),
  "utf8",
);

describe("tenant WhatsApp Evolution migration", () => {
  it("isola uma instância por empresa com RLS", () => {
    expect(migration).toContain("tenant_whatsapp_connections");
    expect(migration).toMatch(/tenant_id uuid primary key/i);
    expect(migration).toMatch(/instance_name text not null unique/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toContain("tenant_whatsapp_connections_select_admin");
    expect(migration).toMatch(
      /revoke all on table public\.tenant_whatsapp_connections[\s\S]*from public, anon, authenticated/i,
    );
  });

  it("reserva o limite mensal e mantém idempotência", () => {
    expect(migration).toContain("reserve_whatsapp_notification");
    expect(migration).toMatch(/for update/i);
    expect(migration).toContain("whatsapp_messages");
    expect(migration).toMatch(/date_trunc\('month', now\(\)\)/i);
    expect(migration).toMatch(/security invoker/i);
    expect(migration).toMatch(
      /grant execute on function public\.reserve_whatsapp_notification[\s\S]*to service_role/i,
    );
  });
});
