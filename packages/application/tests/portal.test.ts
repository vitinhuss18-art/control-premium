import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { TenantAccessError } from "@control-premium/domain";

import { buildClientPortalSnapshot } from "../src/portal";
import type { ContractRecord } from "../src/contracts";
import type { LoanRecord } from "../src/loans";

const loan: LoanRecord = {
  id: "loan-1",
  tenantId: "tenant-a",
  proposalId: "proposal-1",
  clientId: "client-1",
  principalCents: 10_000,
  contractedTotalCents: 11_000,
  installments: [
    {
      id: "installment-1",
      number: 1,
      dueDate: "2026-08-10",
      scheduledCents: 11_000,
      paidCents: 1_000,
      status: "partial",
    },
  ],
  payments: [
    {
      id: "payment-1",
      idempotencyKey: "payment:1",
      amountCents: 1_000,
      allocations: [],
      receiptNumber: "R-00000001",
      status: "confirmed",
      paidAt: "2026-07-24T12:00:00.000Z",
      createdBy: "admin-a",
    },
  ],
  status: "active",
  version: 2,
  createdAt: "2026-07-24T12:00:00.000Z",
  createdBy: "admin-a",
};

const contract: ContractRecord = {
  id: "contract-1",
  tenantId: "tenant-a",
  loanId: "loan-1",
  version: 1,
  status: "signed",
  templateId: "standard",
  templateVersion: 1,
  original: {
    path: "original.pdf",
    sha256: "sha-original",
    createdAt: "2026-07-24T12:00:00.000Z",
  },
  signed: {
    path: "signed.pdf",
    sha256: "sha-signed",
    createdAt: "2026-07-24T13:00:00.000Z",
  },
  createdBy: "admin-a",
  createdAt: "2026-07-24T12:00:00.000Z",
};

describe("client portal", () => {
  it("expõe somente dados financeiros e documentos do próprio cliente", () => {
    const snapshot = buildClientPortalSnapshot({
      tenantId: "tenant-a",
      clientId: "client-1",
      loans: [loan],
      contracts: [contract],
    });
    assert.equal(snapshot.loans[0]?.outstandingCents, 10_000);
    assert.equal(snapshot.loans[0]?.receipts[0]?.receiptNumber, "R-00000001");
    assert.equal(snapshot.loans[0]?.contracts[0]?.signedPath, "signed.pdf");
    assert.equal("score" in snapshot.loans[0]!, false);
  });

  it("bloqueia outra empresa ou cliente", () => {
    assert.throws(
      () =>
        buildClientPortalSnapshot({
          tenantId: "tenant-b",
          clientId: "client-1",
          loans: [loan],
          contracts: [],
        }),
      TenantAccessError,
    );
    assert.throws(() =>
      buildClientPortalSnapshot({
        tenantId: "tenant-a",
        clientId: "client-2",
        loans: [loan],
        contracts: [],
      }),
    );
  });
});
