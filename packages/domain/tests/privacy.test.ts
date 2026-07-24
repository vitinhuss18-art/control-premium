import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  anonymizeClient,
  decideDataDisposition,
  PrivacyPolicyError,
} from "../src/privacy";

describe("privacy and retention", () => {
  it("retém dados sob contrato aberto ou retenção vigente", () => {
    assert.equal(
      decideDataDisposition(
        {
          category: "contact",
          retentionUntil: "2026-08-01T00:00:00.000Z",
          legalHold: false,
          requiredForOpenContract: false,
        },
        new Date("2026-07-24T00:00:00.000Z"),
      ),
      "retain",
    );
    assert.equal(
      decideDataDisposition(
        {
          category: "contact",
          retentionUntil: "2020-01-01T00:00:00.000Z",
          legalHold: false,
          requiredForOpenContract: true,
        },
        new Date("2026-07-24T00:00:00.000Z"),
      ),
      "retain",
    );
  });

  it("anonimiza registros financeiros e exclui contatos expirados", () => {
    const expired = {
      retentionUntil: "2020-01-01T00:00:00.000Z",
      legalHold: false,
      requiredForOpenContract: false,
    };
    assert.equal(
      decideDataDisposition(
        { ...expired, category: "payment" },
        new Date("2026-07-24T00:00:00.000Z"),
      ),
      "anonymize",
    );
    assert.equal(
      decideDataDisposition(
        { ...expired, category: "contact" },
        new Date("2026-07-24T00:00:00.000Z"),
      ),
      "delete",
    );
  });

  it("remove identificadores diretos do cliente", () => {
    const anonymized = anonymizeClient(
      {
        id: "client-1",
        fullName: "Pessoa Teste",
        cpf: "52998224725",
        email: "pessoa@test.invalid",
        phone: "+5511999999999",
        birthDate: "1990-01-01",
        address: { street: "Rua Teste" },
      },
      "anon_12345678",
    );
    assert.deepEqual(anonymized, {
      id: "client-1",
      fullName: "Titular anonimizado anon_12345678",
    });
    assert.throws(
      () => anonymizeClient(anonymized, "bad"),
      PrivacyPolicyError,
    );
  });
});
