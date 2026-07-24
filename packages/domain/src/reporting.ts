import { TenantAccessError } from "./tenant";

export type PortfolioInstallmentSnapshot = Readonly<{
  dueDate: string;
  scheduledCents: number;
  paidCents: number;
}>;

export type PortfolioLoanSnapshot = Readonly<{
  id: string;
  tenantId: string;
  clientId: string;
  collectorId?: string;
  status: "active" | "settled" | "cancelled";
  installments: readonly PortfolioInstallmentSnapshot[];
}>;

export type PortfolioReport = Readonly<{
  asOf: string;
  receivedCents: number;
  outstandingCents: number;
  overdueCents: number;
  forecast30DaysCents: number;
  activeClients: number;
  settledClients: number;
  delinquentClients: number;
  collectors: readonly Readonly<{
    collectorId: string;
    receivedCents: number;
    outstandingCents: number;
    overdueCents: number;
  }>[];
}>;

export class ReportingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportingValidationError";
  }
}

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ReportingValidationError("Data de relatório inválida.");
  }
  const timestamp = Date.parse(value + "T00:00:00.000Z");
  if (Number.isNaN(timestamp)) {
    throw new ReportingValidationError("Data de relatório inválida.");
  }
  return timestamp;
}

function installmentValues(
  installment: PortfolioInstallmentSnapshot,
  asOfTimestamp: number,
  forecastTimestamp: number,
) {
  if (
    !Number.isSafeInteger(installment.scheduledCents) ||
    !Number.isSafeInteger(installment.paidCents) ||
    installment.scheduledCents < 0 ||
    installment.paidCents < 0 ||
    installment.paidCents > installment.scheduledCents
  ) {
    throw new ReportingValidationError(
      "Parcela inválida na origem do relatório.",
    );
  }
  const dueTimestamp = parseDate(installment.dueDate);
  const outstanding = installment.scheduledCents - installment.paidCents;
  return {
    received: installment.paidCents,
    outstanding,
    overdue: dueTimestamp < asOfTimestamp ? outstanding : 0,
    forecast:
      dueTimestamp >= asOfTimestamp && dueTimestamp <= forecastTimestamp
        ? outstanding
        : 0,
  };
}

export function buildPortfolioReport(
  tenantId: string,
  loans: readonly PortfolioLoanSnapshot[],
  asOf: string,
): PortfolioReport {
  const asOfTimestamp = parseDate(asOf);
  const forecastDate = new Date(asOfTimestamp);
  forecastDate.setUTCDate(forecastDate.getUTCDate() + 30);
  const forecastTimestamp = forecastDate.getTime();

  if (loans.some((loan) => loan.tenantId !== tenantId)) {
    throw new TenantAccessError();
  }

  let receivedCents = 0;
  let outstandingCents = 0;
  let overdueCents = 0;
  let forecast30DaysCents = 0;
  const activeClients = new Set<string>();
  const settledClients = new Set<string>();
  const delinquentClients = new Set<string>();
  const collectorTotals = new Map<
    string,
    { receivedCents: number; outstandingCents: number; overdueCents: number }
  >();

  for (const loan of loans) {
    let loanOverdue = 0;
    for (const installment of loan.installments) {
      const values = installmentValues(
        installment,
        asOfTimestamp,
        forecastTimestamp,
      );
      receivedCents += values.received;
      outstandingCents += values.outstanding;
      overdueCents += values.overdue;
      forecast30DaysCents += values.forecast;
      loanOverdue += values.overdue;

      if (loan.collectorId) {
        const current = collectorTotals.get(loan.collectorId) ?? {
          receivedCents: 0,
          outstandingCents: 0,
          overdueCents: 0,
        };
        current.receivedCents += values.received;
        current.outstandingCents += values.outstanding;
        current.overdueCents += values.overdue;
        collectorTotals.set(loan.collectorId, current);
      }
    }

    if (loan.status === "active") activeClients.add(loan.clientId);
    if (loan.status === "settled") settledClients.add(loan.clientId);
    if (loanOverdue > 0) delinquentClients.add(loan.clientId);
  }

  return Object.freeze({
    asOf,
    receivedCents,
    outstandingCents,
    overdueCents,
    forecast30DaysCents,
    activeClients: activeClients.size,
    settledClients: settledClients.size,
    delinquentClients: delinquentClients.size,
    collectors: Object.freeze(
      [...collectorTotals.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([collectorId, totals]) =>
          Object.freeze({ collectorId, ...totals }),
        ),
    ),
  });
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function exportPortfolioCsv(
  loans: readonly PortfolioLoanSnapshot[],
): string {
  const rows = [
    ["loan_id", "client_id", "status", "scheduled_cents", "paid_cents"],
    ...loans.map((loan) => [
      loan.id,
      loan.clientId,
      loan.status,
      loan.installments.reduce(
        (sum, installment) => sum + installment.scheduledCents,
        0,
      ),
      loan.installments.reduce(
        (sum, installment) => sum + installment.paidCents,
        0,
      ),
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
