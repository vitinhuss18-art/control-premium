import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  allocatePayment,
  assertFinancialConsistency,
  calculateOutstandingCents,
  createLoanInstallments,
  LoanValidationError,
  reversePaymentAllocations,
} from "../src/loan";
import { simulateProposal } from "../src/proposal";

function schedule() {
  return createLoanInstallments(
    "loan-1",
    simulateProposal({
      principalCents: 100_000,
      installmentCount: 4,
      periodicInterestBps: 250,
      frequency: "monthly",
      firstDueDate: "2026-08-10",
    }),
    "2026-07-24",
  );
}

describe("loan financial domain", () => {
  it("cria parcelas a partir da simulação aprovada", () => {
    const installments = schedule();
    assert.equal(installments.length, 4);
    assert.equal(calculateOutstandingCents(installments), 110_000);
    assert.deepEqual(
      installments.map((item) => item.status),
      ["scheduled", "scheduled", "scheduled", "scheduled"],
    );
  });

  it("distribui pagamento parcial pelas parcelas mais antigas", () => {
    const result = allocatePayment(schedule(), 30_000, "2026-08-11");

    assert.deepEqual(
      result.allocations.map((item) => item.amountCents),
      [27_500, 2_500],
    );
    assert.equal(result.installments[0]?.status, "paid");
    assert.equal(result.installments[1]?.status, "partial");
    assert.equal(result.outstandingCents, 80_000);
  });

  it("permite quitar exatamente o saldo e impede pagamento excedente", () => {
    const installments = schedule();
    const payoff = allocatePayment(
      installments,
      calculateOutstandingCents(installments),
      "2026-07-24",
    );

    assert.equal(payoff.outstandingCents, 0);
    assert.ok(payoff.installments.every((item) => item.status === "paid"));
    assert.throws(
      () => allocatePayment(installments, 110_001, "2026-07-24"),
      LoanValidationError,
    );
  });

  it("estorna as mesmas alocações e restaura o saldo", () => {
    const payment = allocatePayment(schedule(), 30_000, "2026-08-11");
    const reversed = reversePaymentAllocations(
      payment.installments,
      payment.allocations,
      "2026-08-11",
    );

    assert.equal(calculateOutstandingCents(reversed), 110_000);
    assert.deepEqual(
      reversed.map((item) => item.paidCents),
      [0, 0, 0, 0],
    );
  });

  it("detecta divergência entre razão e parcelas", () => {
    const payment = allocatePayment(schedule(), 30_000, "2026-08-11");
    assert.doesNotThrow(() =>
      assertFinancialConsistency({
        scheduledTotalCents: 110_000,
        installments: payment.installments,
        confirmedPaymentCents: 30_000,
        reversedPaymentCents: 0,
      }),
    );
    assert.throws(
      () =>
        assertFinancialConsistency({
          scheduledTotalCents: 110_000,
          installments: payment.installments,
          confirmedPaymentCents: 29_999,
          reversedPaymentCents: 0,
        }),
      LoanValidationError,
    );
  });
});
