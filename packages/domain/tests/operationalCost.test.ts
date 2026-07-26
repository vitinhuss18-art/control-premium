import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { simulateProposal } from "../src/proposal";
import {
  applyOperationalCost,
  OperationalCostValidationError,
} from "../src/operationalCost";

const baseSimulation = simulateProposal({
  principalCents: 100_000,
  installmentCount: 4,
  periodicInterestBps: 250,
  frequency: "monthly",
  firstDueDate: "2026-08-10",
});

describe("applyOperationalCost", () => {
  it("não altera nada quando o repasse está desligado", () => {
    const result = applyOperationalCost(baseSimulation, { passThrough: false });
    assert.equal(result.operationalCostCents, 0);
    assert.equal(result.totalWithCostsCents, baseSimulation.totalCents);
    assert.deepEqual(
      result.installments.map((i) => i.amountCents),
      baseSimulation.installments.map((i) => i.amountCents),
    );
  });

  it("calcula por porcentagem sobre o total e distribui nas parcelas sem perder centavo", () => {
    const result = applyOperationalCost(baseSimulation, {
      passThrough: true,
      mode: "percentage",
      percentageBps: 200, // 2%
    });

    assert.equal(result.operationalCostCents, 2_200); // 2% de 110_000
    assert.equal(result.totalWithCostsCents, 112_200);
    const somaParcelas = result.installments.reduce(
      (soma, item) => soma + item.amountCents,
      0,
    );
    assert.equal(somaParcelas, 112_200);
  });

  it("calcula por valor fixo e distribui nas parcelas", () => {
    const result = applyOperationalCost(baseSimulation, {
      passThrough: true,
      mode: "fixed",
      fixedCents: 1_500,
    });

    assert.equal(result.operationalCostCents, 1_500);
    assert.equal(result.totalWithCostsCents, 111_500);
    const somaParcelas = result.installments.reduce(
      (soma, item) => soma + item.amountCents,
      0,
    );
    assert.equal(somaParcelas, 111_500);
  });

  it("rejeita porcentagem inválida", () => {
    assert.throws(
      () =>
        applyOperationalCost(baseSimulation, {
          passThrough: true,
          mode: "percentage",
          percentageBps: -1,
        }),
      OperationalCostValidationError,
    );
  });

  it("rejeita quando o repasse está ligado mas o modo não foi informado", () => {
    assert.throws(
      () => applyOperationalCost(baseSimulation, { passThrough: true }),
      OperationalCostValidationError,
    );
  });
});
