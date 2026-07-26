import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  InstallmentSaleValidationError,
  simulateInstallmentSale,
} from "../src/installmentSale";

describe("simulateInstallmentSale", () => {
  it("financia o preço menos a entrada, com juros fixo (sem recálculo de saldo)", () => {
    const result = simulateInstallmentSale({
      productName: "Fogão 4 bocas",
      salePriceCents: 120_000,
      downPaymentCents: 20_000,
      installmentCount: 4,
      periodicInterestBps: 250,
      frequency: "monthly",
      firstDueDate: "2026-08-10",
    });

    assert.equal(result.operationType, "installment_sale");
    assert.equal(result.financedCents, 100_000);
    assert.equal(result.interestCents, 10_000);
    assert.equal(result.totalCents, 110_000);
    assert.deepEqual(
      result.installments.map((item) => item.amountCents),
      [27_500, 27_500, 27_500, 27_500],
    );
  });

  it("funciona sem entrada e sem juros (campos opcionais)", () => {
    const result = simulateInstallmentSale({
      productName: "Bicicleta",
      salePriceCents: 90_000,
      installmentCount: 3,
      frequency: "monthly",
      firstDueDate: "2026-08-10",
    });

    assert.equal(result.downPaymentCents, 0);
    assert.equal(result.financedCents, 90_000);
    assert.equal(result.interestCents, 0);
    assert.deepEqual(
      result.installments.map((item) => item.amountCents),
      [30_000, 30_000, 30_000],
    );
  });

  it("rejeita produto sem nome", () => {
    assert.throws(
      () =>
        simulateInstallmentSale({
          productName: "   ",
          salePriceCents: 50_000,
          installmentCount: 2,
          frequency: "monthly",
          firstDueDate: "2026-08-10",
        }),
      InstallmentSaleValidationError,
    );
  });

  it("rejeita entrada maior ou igual ao valor da venda", () => {
    assert.throws(
      () =>
        simulateInstallmentSale({
          productName: "Celular",
          salePriceCents: 50_000,
          downPaymentCents: 50_000,
          installmentCount: 2,
          frequency: "monthly",
          firstDueDate: "2026-08-10",
        }),
      InstallmentSaleValidationError,
    );
  });

  it("rejeita entrada negativa", () => {
    assert.throws(
      () =>
        simulateInstallmentSale({
          productName: "Celular",
          salePriceCents: 50_000,
          downPaymentCents: -1,
          installmentCount: 2,
          frequency: "monthly",
          firstDueDate: "2026-08-10",
        }),
      InstallmentSaleValidationError,
    );
  });
});
