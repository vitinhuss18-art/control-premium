import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { TenantAccessError } from "../src/tenant";
import {
  buildPortfolioReport,
  exportPortfolioCsv,
  type PortfolioLoanSnapshot,
} from "../src/reporting";

const loans: readonly PortfolioLoanSnapshot[] = [
  {
    id: "loan-1",
    tenantId: "tenant-a",
    clientId: "client-1",
    collectorId: "collector-1",
    status: "active",
    installments: [
      { dueDate: "2026-07-10", scheduledCents: 10_000, paidCents: 2_000 },
      { dueDate: "2026-08-10", scheduledCents: 10_000, paidCents: 0 },
    ],
  },
  {
    id: "loan-2",
    tenantId: "tenant-a",
    clientId: "client-2",
    collectorId: "collector-1",
    status: "settled",
    installments: [
      { dueDate: "2026-07-01", scheduledCents: 5_000, paidCents: 5_000 },
    ],
  },
];

describe("reporting", () => {
  it("reconcilia recebido, aberto, vencido e previsão", () => {
    const report = buildPortfolioReport("tenant-a", loans, "2026-07-24");
    assert.equal(report.receivedCents, 7_000);
    assert.equal(report.outstandingCents, 18_000);
    assert.equal(report.overdueCents, 8_000);
    assert.equal(report.forecast30DaysCents, 10_000);
    assert.equal(report.activeClients, 1);
    assert.equal(report.settledClients, 1);
    assert.equal(report.delinquentClients, 1);
    assert.deepEqual(report.collectors, [
      {
        collectorId: "collector-1",
        receivedCents: 7_000,
        outstandingCents: 18_000,
        overdueCents: 8_000,
      },
    ]);
  });

  it("bloqueia mistura de empresas", () => {
    assert.throws(
      () =>
        buildPortfolioReport(
          "tenant-a",
          [{ ...loans[0]!, tenantId: "tenant-b" }],
          "2026-07-24",
        ),
      TenantAccessError,
    );
  });

  it("exporta CSV e neutraliza fórmula", () => {
    const csv = exportPortfolioCsv([
      { ...loans[0]!, clientId: "=HYPERLINK(\"evil\")" },
    ]);
    assert.match(csv, /'=HYPERLINK/);
    assert.match(csv, /"20000"/);
  });
});
