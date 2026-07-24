import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  buildContractStoragePath,
  ContractValidationError,
  renderContractTemplate,
} from "../src/contract";

describe("contract domain", () => {
  it("renderiza somente quando todos os campos existem", () => {
    const rendered = renderContractTemplate(
      {
        id: "loan-standard",
        version: 2,
        body: "Cliente {{client.name}}, total {{loan.total}}.",
        requiredFields: ["client.name", "loan.total"],
      },
      { "client.name": "Cliente Teste", "loan.total": "R$ 1.100,00" },
    );

    assert.equal(
      rendered.content,
      "Cliente Cliente Teste, total R$ 1.100,00.",
    );
    assert.equal(rendered.templateVersion, 2);
  });

  it("recusa modelo incompleto ou campo desconhecido", () => {
    assert.throws(
      () =>
        renderContractTemplate(
          {
            id: "loan-standard",
            version: 1,
            body: "{{client.name}} {{missing}}",
            requiredFields: ["client.name"],
          },
          { "client.name": "Cliente Teste" },
        ),
      ContractValidationError,
    );
  });

  it("gera caminho privado versionado e previsível", () => {
    assert.equal(
      buildContractStoragePath({
        tenantId: "tenant-a",
        loanId: "loan-1",
        contractId: "contract-1",
        version: 3,
        kind: "signed",
      }),
      "tenant-a/loans/loan-1/contracts/contract-1/v3/signed.pdf",
    );
  });
});
