import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "vitest";

const migrationUrl = new URL(
  "../../../supabase/migrations/202607250001_finance_automation_and_compliance.sql",
  import.meta.url,
);

describe("finance and compliance migration", () => {
  it("protege razão, idempotência, isolamento e evidências", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    for (const required of [
      "financial_ledger",
      "prevent_financial_ledger_mutation",
      "payment_allocations",
      "message_consents",
      "ai_suggestions",
      "subscription_events",
      "data_subject_requests",
      "security_incidents",
      "enable row level security",
      "unique (tenant_id, idempotency_key)",
    ]) {
      assert.match(
        sql,
        new RegExp(required.replaceAll("(", "\\(").replaceAll(")", "\\)")),
      );
    }
    assert.match(sql, /revoke insert, update, delete/i);
  });
});
