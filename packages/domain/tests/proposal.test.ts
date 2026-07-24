import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  calculateExplainableCreditScore,
  createProposalChecklist,
  isProposalChecklistComplete,
  ProposalValidationError,
  simulateProposal,
  validateProposalChecklist,
  type ProposalChecklistItem,
} from "../src/proposal";

describe("simulateProposal", () => {
  it("calcula juros simples periódicos e parcelas determinísticas", () => {
    const result = simulateProposal({
      principalCents: 100_000,
      installmentCount: 4,
      periodicInterestBps: 250,
      frequency: "monthly",
      firstDueDate: "2026-07-31",
    });

    assert.equal(result.interestCents, 10_000);
    assert.equal(result.totalCents, 110_000);
    assert.deepEqual(
      result.installments.map((item) => item.amountCents),
      [27_500, 27_500, 27_500, 27_500],
    );
    assert.deepEqual(
      result.installments.map((item) => item.dueDate),
      ["2026-07-31", "2026-08-31", "2026-09-30", "2026-11-02"],
    );
  });

  it("distribui centavos sem perder ou criar dinheiro", () => {
    const result = simulateProposal({
      principalCents: 100,
      installmentCount: 3,
      periodicInterestBps: 0,
      frequency: "weekly",
      firstDueDate: "2026-07-24",
    });

    assert.deepEqual(
      result.installments.map((item) => item.amountCents),
      [34, 33, 33],
    );
    assert.equal(
      result.installments.reduce((sum, item) => sum + item.amountCents, 0),
      result.totalCents,
    );
  });

  it("move parcelas diárias por dias úteis e respeita feriados", () => {
    const result = simulateProposal({
      principalCents: 300,
      installmentCount: 3,
      periodicInterestBps: 0,
      frequency: "daily",
      firstDueDate: "2026-07-25",
      holidays: ["2026-07-28"],
    });

    assert.deepEqual(
      result.installments.map((item) => item.dueDate),
      ["2026-07-27", "2026-07-29", "2026-07-30"],
    );
  });

  it("recusa valores, taxas, datas e prazos inseguros", () => {
    const base = {
      principalCents: 10_000,
      installmentCount: 2,
      periodicInterestBps: 100,
      frequency: "monthly" as const,
      firstDueDate: "2026-08-10",
    };

    assert.throws(
      () => simulateProposal({ ...base, principalCents: 0 }),
      ProposalValidationError,
    );
    assert.throws(
      () => simulateProposal({ ...base, installmentCount: 361 }),
      ProposalValidationError,
    );
    assert.throws(
      () => simulateProposal({ ...base, periodicInterestBps: 10_001 }),
      ProposalValidationError,
    );
    assert.throws(
      () => simulateProposal({ ...base, firstDueDate: "2026-02-30" }),
      ProposalValidationError,
    );
  });
});

describe("proposal checklist", () => {
  it("exige todos os documentos verificados e rastreáveis", () => {
    const checklist = createProposalChecklist();
    assert.equal(isProposalChecklistComplete(checklist), false);

    const verified = checklist.map(
      (item): ProposalChecklistItem => ({
        ...item,
        status: "verified",
        verifiedBy: "reviewer-1",
        verifiedAt: "2026-07-24T12:00:00.000Z",
      }),
    );
    assert.equal(isProposalChecklistComplete(verified), true);

    assert.throws(
      () =>
        validateProposalChecklist([
          ...verified,
          { ...verified[0]! },
        ]),
      ProposalValidationError,
    );
  });
});

describe("calculateExplainableCreditScore", () => {
  it("explica todos os pontos e nunca decide crédito automaticamente", () => {
    const score = calculateExplainableCreditScore({
      identityVerified: true,
      addressVerified: true,
      incomeVerified: true,
      relationshipMonths: 60,
      debtToIncomeBps: 2_500,
    });

    assert.equal(score.value, 100);
    assert.equal(score.riskBand, "low");
    assert.equal(score.requiresHumanDecision, true);
    assert.equal(
      score.factors.reduce((sum, factor) => sum + factor.points, 0),
      score.value,
    );
  });

  it("não usa atributos sensíveis e valida entradas objetivas", () => {
    const score = calculateExplainableCreditScore({
      identityVerified: false,
      addressVerified: false,
      incomeVerified: false,
      relationshipMonths: 0,
      debtToIncomeBps: 8_000,
    });

    assert.equal(score.value, 0);
    assert.equal(score.riskBand, "high");
    assert.throws(
      () =>
        calculateExplainableCreditScore({
          identityVerified: true,
          addressVerified: true,
          incomeVerified: true,
          relationshipMonths: -1,
          debtToIncomeBps: 0,
        }),
      ProposalValidationError,
    );
  });
});
