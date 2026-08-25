export type ClientLoanInstallment = Readonly<{
  dueDate: string;
  totalCents: number;
  paidCents: number;
  status: string;
}>;

export type ClientLoanEligibility = Readonly<{
  status: string;
  outstandingCents: number;
  installments: readonly ClientLoanInstallment[];
}>;

function isoDate(referenceDate: Date): string {
  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error("Data de referência inválida.");
  }
  return referenceDate.toISOString().slice(0, 10);
}

/**
 * A amortização só fica disponível para contrato ativo e em dia.
 * Uma parcela é considerada vencida quando a data já passou e ainda existe
 * saldo, ou quando o banco já a marcou explicitamente como atrasada.
 */
export function canAmortizeClientLoan(
  loan: ClientLoanEligibility,
  referenceDate: Date = new Date(),
): boolean {
  if (loan.status !== "active" || loan.outstandingCents <= 0) return false;

  const today = isoDate(referenceDate);
  return loan.installments.every((installment) => {
    if (installment.status === "cancelled") return true;
    if (
      installment.status === "paid" ||
      installment.paidCents >= installment.totalCents
    ) {
      return true;
    }
    if (installment.status === "overdue") return false;
    return installment.dueDate >= today;
  });
}
