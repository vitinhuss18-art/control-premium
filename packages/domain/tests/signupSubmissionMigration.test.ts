import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/202608050001_atomic_client_proposal.sql"),
  "utf8",
);

describe("atomic client proposal migration", () => {
  it("trava, registra e consome o convite na mesma função", () => {
    expect(migration).toContain("submit_client_proposal");
    expect(migration).toMatch(/for update/i);
    expect(migration).toMatch(/insert into public\.client_proposals/i);
    expect(migration).toMatch(/update public\.client_signup_links/i);
    expect(migration).toMatch(/set active = false/i);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = ''/i);
    expect(migration).toMatch(
      /revoke all[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(/grant execute[\s\S]*to anon;/i);
  });
});
