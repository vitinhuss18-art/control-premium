import { describe, expect, it } from "vitest";

import { canAmortizeClientLoan } from "./clientLoanDashboard";

const referenceDate = new Date("2026-08-25T12:00:00.000Z");

describe("amortização no portal do cliente", () => {
  it("permite quando o empréstimo está ativo e sem parcela vencida", () => {
    expect(
      canAmortizeClientLoan(
        {
          status: "active",
          outstandingCents: 80_000,
          installments: [
            {
              dueDate: "2026-08-25",
              totalCents: 20_000,
              paidCents: 0,
              status: "pending",
            },
          ],
        },
        referenceDate,
      ),
    ).toBe(true);
  });

  it("bloqueia quando existe parcela vencida em aberto", () => {
    expect(
      canAmortizeClientLoan(
        {
          status: "active",
          outstandingCents: 80_000,
          installments: [
            {
              dueDate: "2026-08-24",
              totalCents: 20_000,
              paidCents: 10_000,
              status: "partially_paid",
            },
          ],
        },
        referenceDate,
      ),
    ).toBe(false);
  });

  it("permite depois que a parcela vencida foi totalmente paga", () => {
    expect(
      canAmortizeClientLoan(
        {
          status: "active",
          outstandingCents: 60_000,
          installments: [
            {
              dueDate: "2026-08-24",
              totalCents: 20_000,
              paidCents: 20_000,
              status: "paid",
            },
          ],
        },
        referenceDate,
      ),
    ).toBe(true);
  });

  it("bloqueia contrato atrasado, quitado ou sem saldo", () => {
    const installments = [
      {
        dueDate: "2026-09-25",
        totalCents: 20_000,
        paidCents: 0,
        status: "pending",
      },
    ];

    expect(
      canAmortizeClientLoan(
        { status: "delinquent", outstandingCents: 20_000, installments },
        referenceDate,
      ),
    ).toBe(false);
    expect(
      canAmortizeClientLoan(
        { status: "settled", outstandingCents: 0, installments },
        referenceDate,
      ),
    ).toBe(false);
  });
});
