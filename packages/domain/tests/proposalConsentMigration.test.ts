import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const evidenceMigration = readFileSync(
  resolve("supabase/migrations/20260812011754_proposal_consent_evidence.sql"),
  "utf8",
);
const enforcementMigration = readFileSync(
  resolve("supabase/migrations/20260812011933_enforce_proposal_consent.sql"),
  "utf8",
);

describe("proposal consent migrations", () => {
  it("registra proposta e evidência na mesma transação", () => {
    expect(evidenceMigration).toContain("submit_client_proposal_with_consent");
    expect(evidenceMigration).toMatch(/for update/i);
    expect(evidenceMigration).toMatch(
      /insert into public\.client_proposals[\s\S]*insert into public\.proposal_consent_evidence/i,
    );
    expect(evidenceMigration).toContain("proposal-consent-v1-2026-08-11");
    expect(evidenceMigration).toContain(
      "485e0579d223d816b17952e9679b249103fa7be38b425d90756a893fdd8d67f6",
    );
    expect(evidenceMigration).toMatch(/security definer/i);
    expect(evidenceMigration).toMatch(/set search_path = ''/i);
  });

  it("protege a evidência por RLS, privilégio mínimo e imutabilidade", () => {
    expect(evidenceMigration).toMatch(/enable row level security/i);
    expect(evidenceMigration).toContain(
      "proposal_consent_evidence_select_staff",
    );
    expect(evidenceMigration).toMatch(
      /revoke all on table public\.proposal_consent_evidence[\s\S]*from public, anon, authenticated/i,
    );
    expect(evidenceMigration).toContain("proposal_consent_evidence_immutable");
    expect(evidenceMigration).toMatch(/before update or delete/i);
    expect(evidenceMigration).toMatch(
      /revoke all on function public\.prevent_proposal_consent_mutation\(\)[\s\S]*from public, anon, authenticated/i,
    );
  });

  it("fecha os caminhos antigos depois do deploy compatível", () => {
    expect(enforcementMigration).toMatch(
      /revoke execute on function public\.submit_client_proposal/i,
    );
    expect(enforcementMigration).toMatch(
      /drop policy if exists client_proposals_insert_anon/i,
    );
    expect(enforcementMigration).toMatch(
      /revoke insert on table public\.client_proposals from anon, authenticated/i,
    );
  });
});
