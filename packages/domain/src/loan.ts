import type { ProposalSimulation } from "./proposal";

export const installmentStatuses = [
  "scheduled",
  "partial",
  "paid",
  "overdue",
] as const;

export type InstallmentStatus = (typeof installmentStatuses)[number];

export type LoanInstallment = Readonly<{
  id: string;
  number: number;
  dueDate: string;
  scheduledCents: number;
  paidCents: number;
  status: InstallmentStatus;
}>;

export type LoanPaymentAllocation = Readonly<{
  installmentId: string;
  installmentNumber: number;
  amountCents: number;
}>;

export type PaymentAllocationResult = Readonly<{
  installments: readonly LoanInstallment[];
  allocations: readonly LoanPaymentAllocation[];
  paidCents: number;
  outstandingCents: number;
}>;

export class LoanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanValidationError";
  }
}

function assertMoney(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LoanValidationError(
      label + " deve ser informado em centavos inteiros não negativos.",
    );
  }
}

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new LoanValidationError("Data financeira inválida.");
  }
  const timestamp = Date.parse(value + "T00:00:00.000Z");
  if (Number.isNaN(timestamp)) {
    throw new LoanValidationError("Data financeira inválida.");
  }
  return timestamp;
}

function statusForInstallment(
  installment: Pick<
    LoanInstallment,
    "dueDate" | "scheduledCents" | "paidCents"
  >,
  referenceDate: string,
): InstallmentStatus {
  if (installment.paidCents >= installment.scheduledCents) return "paid";
  if (installment.paidCents > 0) return "partial";
  return parseDate(installment.dueDate) < parseDate(referenceDate)
    ? "overdue"
    : "scheduled";
}

export function createLoanInstallments(
  loanId: string,
  simulation: ProposalSimulation,
  referenceDate: string,
): readonly LoanInstallment[] {
  if (!loanId.trim()) {
    throw new LoanValidationError("Identificador do empréstimo inválido.");
  }
  parseDate(referenceDate);

  return Object.freeze(
    simulation.installments.map((item) =>
      Object.freeze({
        id: loanId + ":installment:" + item.number,
        number: item.number,
        dueDate: item.dueDate,
        scheduledCents: item.amountCents,
        paidCents: 0,
        status: statusForInstallment(
          {
            dueDate: item.dueDate,
            scheduledCents: item.amountCents,
            paidCents: 0,
          },
          referenceDate,
        ),
      }),
    ),
  );
}

export function calculateOutstandingCents(
  installments: readonly LoanInstallment[],
): number {
  const total = installments.reduce((sum, installment) => {
    assertMoney(installment.scheduledCents, "Valor da parcela");
    assertMoney(installment.paidCents, "Valor pago da parcela");
    if (installment.paidCents > installment.scheduledCents) {
      throw new LoanValidationError(
        "Uma parcela não pode possuir pagamento acima do valor previsto.",
      );
    }
    return sum + installment.scheduledCents - installment.paidCents;
  }, 0);
  if (!Number.isSafeInteger(total)) {
    throw new LoanValidationError("O saldo ultrapassa o limite seguro.");
  }
  return total;
}

export function allocatePayment(
  installments: readonly LoanInstallment[],
  amountCents: number,
  referenceDate: string,
): PaymentAllocationResult {
  assertMoney(amountCents, "Pagamento");
  if (amountCents === 0) {
    throw new LoanValidationError("O pagamento deve ser maior que zero.");
  }
  parseDate(referenceDate);

  const outstandingBefore = calculateOutstandingCents(installments);
  if (amountCents > outstandingBefore) {
    throw new LoanValidationError(
      "O pagamento não pode ultrapassar o saldo devedor.",
    );
  }

  let remaining = amountCents;
  const allocations: LoanPaymentAllocation[] = [];
  const updated = [...installments]
    .sort((left, right) => left.number - right.number)
    .map((installment): LoanInstallment => {
      const installmentOutstanding =
        installment.scheduledCents - installment.paidCents;
      const allocated = Math.min(remaining, installmentOutstanding);
      remaining -= allocated;
      const paidCents = installment.paidCents + allocated;

      if (allocated > 0) {
        allocations.push({
          installmentId: installment.id,
          installmentNumber: installment.number,
          amountCents: allocated,
        });
      }

      return Object.freeze({
        ...installment,
        paidCents,
        status: statusForInstallment(
          { ...installment, paidCents },
          referenceDate,
        ),
      });
    });

  if (remaining !== 0) {
    throw new LoanValidationError("Falha ao distribuir o pagamento.");
  }

  return Object.freeze({
    installments: Object.freeze(updated),
    allocations: Object.freeze(allocations),
    paidCents: amountCents,
    outstandingCents: outstandingBefore - amountCents,
  });
}

export function reversePaymentAllocations(
  installments: readonly LoanInstallment[],
  allocations: readonly LoanPaymentAllocation[],
  referenceDate: string,
): readonly LoanInstallment[] {
  parseDate(referenceDate);
  const byInstallment = new Map(
    allocations.map((allocation) => [
      allocation.installmentId,
      allocation.amountCents,
    ]),
  );

  return Object.freeze(
    installments.map((installment): LoanInstallment => {
      const reversedCents = byInstallment.get(installment.id) ?? 0;
      assertMoney(reversedCents, "Estorno");
      if (reversedCents > installment.paidCents) {
        throw new LoanValidationError(
          "O estorno ultrapassa o valor pago da parcela.",
        );
      }
      const paidCents = installment.paidCents - reversedCents;
      return Object.freeze({
        ...installment,
        paidCents,
        status: statusForInstallment(
          { ...installment, paidCents },
          referenceDate,
        ),
      });
    }),
  );
}

export function assertFinancialConsistency(input: {
  scheduledTotalCents: number;
  installments: readonly LoanInstallment[];
  confirmedPaymentCents: number;
  reversedPaymentCents: number;
}): void {
  assertMoney(input.scheduledTotalCents, "Total contratado");
  assertMoney(input.confirmedPaymentCents, "Pagamentos confirmados");
  assertMoney(input.reversedPaymentCents, "Pagamentos estornados");

  const scheduled = input.installments.reduce(
    (sum, installment) => sum + installment.scheduledCents,
    0,
  );
  const paid = input.installments.reduce(
    (sum, installment) => sum + installment.paidCents,
    0,
  );
  const netPaid = input.confirmedPaymentCents - input.reversedPaymentCents;

  if (
    scheduled !== input.scheduledTotalCents ||
    paid !== netPaid ||
    calculateOutstandingCents(input.installments) !==
      input.scheduledTotalCents - netPaid
  ) {
    throw new LoanValidationError(
      "O razão financeiro não corresponde às parcelas.",
    );
  }
}
