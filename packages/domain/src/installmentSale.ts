import {
  simulateProposal,
  type PaymentFrequency,
  type ProposalSimulation,
} from "./proposal";

export type InstallmentSaleInput = Readonly<{
  productName: string;
  productDescription?: string;
  productPhotoPath?: string;
  salePriceCents: number;
  downPaymentCents?: number;
  installmentCount: number;
  periodicInterestBps?: number;
  frequency: PaymentFrequency;
  firstDueDate: string;
  holidays?: readonly string[];
}>;

export type InstallmentSaleSimulation = ProposalSimulation &
  Readonly<{
    operationType: "installment_sale";
    productName: string;
    productDescription?: string;
    productPhotoPath?: string;
    salePriceCents: number;
    downPaymentCents: number;
    financedCents: number;
  }>;

export class InstallmentSaleValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "InstallmentSaleValidationError";
    this.field = field;
  }
}

/**
 * Simula uma venda parcelada reaproveitando exatamente o mesmo motor de
 * juros/parcelas usado nos empréstimos (juros fixo, calculado uma única vez
 * — sem recálculo sobre saldo devedor). A única diferença de cálculo é que
 * o valor financiado é o preço de venda menos a entrada, não o principal
 * de um empréstimo.
 */
export function simulateInstallmentSale(
  input: InstallmentSaleInput,
): InstallmentSaleSimulation {
  const productName = input.productName.trim();
  if (!productName) {
    throw new InstallmentSaleValidationError(
      "productName",
      "Informe o nome do produto.",
    );
  }

  if (
    !Number.isSafeInteger(input.salePriceCents) ||
    input.salePriceCents <= 0
  ) {
    throw new InstallmentSaleValidationError(
      "salePriceCents",
      "Informe um valor de venda válido em centavos.",
    );
  }

  const downPaymentCents = input.downPaymentCents ?? 0;
  if (!Number.isSafeInteger(downPaymentCents) || downPaymentCents < 0) {
    throw new InstallmentSaleValidationError(
      "downPaymentCents",
      "A entrada não pode ser negativa.",
    );
  }
  if (downPaymentCents >= input.salePriceCents) {
    throw new InstallmentSaleValidationError(
      "downPaymentCents",
      "A entrada deve ser menor que o valor da venda.",
    );
  }

  const financedCents = input.salePriceCents - downPaymentCents;

  const simulation = simulateProposal({
    principalCents: financedCents,
    installmentCount: input.installmentCount,
    periodicInterestBps: input.periodicInterestBps ?? 0,
    frequency: input.frequency,
    firstDueDate: input.firstDueDate,
    holidays: input.holidays,
  });

  return Object.freeze({
    ...simulation,
    operationType: "installment_sale" as const,
    productName,
    productDescription: input.productDescription?.trim() || undefined,
    productPhotoPath: input.productPhotoPath?.trim() || undefined,
    salePriceCents: input.salePriceCents,
    downPaymentCents,
    financedCents,
  });
}
