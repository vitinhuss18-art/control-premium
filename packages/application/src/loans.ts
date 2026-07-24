import {
  assertFinancialConsistency,
  assertTenantAccess,
  calculateOutstandingCents,
  createLoanInstallments,
  hasPermission,
  type AppRole,
  type LoanInstallment,
  type LoanPaymentAllocation,
} from "@control-premium/domain";

import type {
  ProposalActorContext,
  ProposalAuditWriter,
  ProposalRecord,
} from "./proposals";

export type LoanStatus = "active" | "settled" | "cancelled";

export type LoanPayment = Readonly<{
  id: string;
  idempotencyKey: string;
  amountCents: number;
  allocations: readonly LoanPaymentAllocation[];
  receiptNumber: string;
  status: "confirmed" | "reversed";
  paidAt: string;
  createdBy: string;
  reversedAt?: string;
  reversedBy?: string;
  reversalReason?: string;
}>;

export type LoanRecord = Readonly<{
  id: string;
  tenantId: string;
  proposalId: string;
  clientId: string;
  principalCents: number;
  contractedTotalCents: number;
  installments: readonly LoanInstallment[];
  payments: readonly LoanPayment[];
  status: LoanStatus;
  version: number;
  createdAt: string;
  createdBy: string;
}>;

export type PaymentMutationResult = Readonly<{
  loan: LoanRecord;
  payment: LoanPayment;
  duplicate: boolean;
}>;

export interface LoanRepository {
  findById(tenantId: string, loanId: string): Promise<LoanRecord | null>;
  findByProposalId(
    tenantId: string,
    proposalId: string,
  ): Promise<LoanRecord | null>;
  create(loan: LoanRecord): Promise<LoanRecord>;
  recordPayment(input: {
    tenantId: string;
    loanId: string;
    expectedVersion: number;
    idempotencyKey: string;
    amountCents: number;
    paidAt: string;
    actorId: string;
  }): Promise<PaymentMutationResult>;
  reversePayment(input: {
    tenantId: string;
    loanId: string;
    paymentId: string;
    expectedVersion: number;
    reversedAt: string;
    actorId: string;
    reason: string;
  }): Promise<PaymentMutationResult>;
}

export class LoanNotFoundError extends Error {
  constructor() {
    super("Empréstimo não encontrado.");
    this.name = "LoanNotFoundError";
  }
}

export class LoanPermissionError extends Error {
  constructor() {
    super("O usuário não possui permissão para esta operação financeira.");
    this.name = "LoanPermissionError";
  }
}

export class LoanStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanStateError";
  }
}

export class LoanConcurrencyError extends Error {
  constructor() {
    super("O empréstimo foi alterado por outra operação. Tente novamente.");
    this.name = "LoanConcurrencyError";
  }
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 8 ||
    normalized.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    throw new LoanStateError("Chave de idempotência inválida.");
  }
  return normalized;
}

function normalizeReversalReason(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 10 || normalized.length > 1_000) {
    throw new LoanStateError(
      "O estorno exige uma justificativa entre 10 e 1.000 caracteres.",
    );
  }
  return normalized;
}

function validateInstant(value: string, label: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new LoanStateError(label + " inválido.");
  }
  return instant.toISOString();
}

export class LoanService {
  private readonly loans: LoanRepository;
  private readonly audit: ProposalAuditWriter;
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    loans: LoanRepository,
    audit: ProposalAuditWriter,
    createId: () => string,
    now: () => Date = () => new Date(),
  ) {
    this.loans = loans;
    this.audit = audit;
    this.createId = createId;
    this.now = now;
  }

  async createFromApprovedProposal(
    context: ProposalActorContext,
    proposal: ProposalRecord,
  ): Promise<LoanRecord> {
    this.requirePermission(context.role, "write");
    assertTenantAccess(context.tenantId, proposal.tenantId);
    if (proposal.status !== "approved" || !proposal.decision) {
      throw new LoanStateError(
        "Somente uma proposta aprovada por decisão humana pode virar empréstimo.",
      );
    }
    const existing = await this.loans.findByProposalId(
      context.tenantId,
      proposal.id,
    );
    if (existing) {
      return existing;
    }

    const createdAt = this.now();
    const loanId = this.createId();
    const loan = await this.loans.create({
      id: loanId,
      tenantId: context.tenantId,
      proposalId: proposal.id,
      clientId: proposal.clientId,
      principalCents: proposal.simulation.principalCents,
      contractedTotalCents: proposal.simulation.totalCents,
      installments: createLoanInstallments(
        loanId,
        proposal.simulation,
        createdAt.toISOString().slice(0, 10),
      ),
      payments: Object.freeze([]),
      status: "active",
      version: 1,
      createdAt: createdAt.toISOString(),
      createdBy: context.userId,
    });

    await this.writeAudit(context, loan.id, "loan.created", {
      proposalId: proposal.id,
      contractedTotalCents: loan.contractedTotalCents,
    });
    return loan;
  }

  async get(
    context: ProposalActorContext,
    loanId: string,
  ): Promise<LoanRecord> {
    this.requirePermission(context.role, "read");
    const loan = await this.loans.findById(context.tenantId, loanId);
    if (!loan) throw new LoanNotFoundError();
    assertTenantAccess(context.tenantId, loan.tenantId);
    return loan;
  }

  async registerPayment(
    context: ProposalActorContext,
    loanId: string,
    input: {
      amountCents: number;
      idempotencyKey: string;
      paidAt: string;
    },
  ): Promise<PaymentMutationResult> {
    this.requirePermission(context.role, "write");
    const loan = await this.get(context, loanId);
    if (loan.status !== "active") {
      throw new LoanStateError("O empréstimo não aceita novos pagamentos.");
    }
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new LoanStateError(
        "O pagamento deve ser informado em centavos inteiros positivos.",
      );
    }

    const result = await this.loans.recordPayment({
      tenantId: context.tenantId,
      loanId,
      expectedVersion: loan.version,
      idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
      amountCents: input.amountCents,
      paidAt: validateInstant(input.paidAt, "Horário do pagamento"),
      actorId: context.userId,
    });
    this.assertConsistency(result.loan);

    if (!result.duplicate) {
      await this.writeAudit(context, loan.id, "loan.payment.confirmed", {
        paymentId: result.payment.id,
        amountCents: result.payment.amountCents,
        receiptNumber: result.payment.receiptNumber,
      });
    }
    return result;
  }

  async quoteEarlyPayoff(
    context: ProposalActorContext,
    loanId: string,
  ): Promise<
    Readonly<{
      loanId: string;
      amountCents: number;
      quotedAt: string;
      expiresAt: string;
    }>
  > {
    const loan = await this.get(context, loanId);
    if (loan.status !== "active") {
      throw new LoanStateError("O empréstimo já está encerrado.");
    }
    const quotedAt = this.now();
    const expiresAt = new Date(quotedAt.getTime() + 15 * 60 * 1_000);
    return Object.freeze({
      loanId,
      amountCents: calculateOutstandingCents(loan.installments),
      quotedAt: quotedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  async settleEarly(
    context: ProposalActorContext,
    loanId: string,
    input: { quoteAmountCents: number; idempotencyKey: string },
  ): Promise<PaymentMutationResult> {
    const quote = await this.quoteEarlyPayoff(context, loanId);
    if (input.quoteAmountCents !== quote.amountCents) {
      throw new LoanStateError(
        "O valor de quitação não corresponde ao saldo atual.",
      );
    }
    return this.registerPayment(context, loanId, {
      amountCents: quote.amountCents,
      idempotencyKey: input.idempotencyKey,
      paidAt: this.now().toISOString(),
    });
  }

  async reversePayment(
    context: ProposalActorContext,
    loanId: string,
    paymentId: string,
    reason: string,
  ): Promise<PaymentMutationResult> {
    this.requirePermission(context.role, "reverse");
    const loan = await this.get(context, loanId);
    const result = await this.loans.reversePayment({
      tenantId: context.tenantId,
      loanId,
      paymentId,
      expectedVersion: loan.version,
      reversedAt: this.now().toISOString(),
      actorId: context.userId,
      reason: normalizeReversalReason(reason),
    });
    this.assertConsistency(result.loan);

    if (!result.duplicate) {
      await this.writeAudit(context, loan.id, "loan.payment.reversed", {
        paymentId: result.payment.id,
        amountCents: result.payment.amountCents,
        reason: result.payment.reversalReason,
      });
    }
    return result;
  }

  private assertConsistency(loan: LoanRecord): void {
    const confirmedPaymentCents = loan.payments.reduce(
      (sum, payment) => sum + payment.amountCents,
      0,
    );
    const reversedPaymentCents = loan.payments
      .filter((payment) => payment.status === "reversed")
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    assertFinancialConsistency({
      scheduledTotalCents: loan.contractedTotalCents,
      installments: loan.installments,
      confirmedPaymentCents,
      reversedPaymentCents,
    });
  }

  private requirePermission(
    role: AppRole,
    action: "read" | "write" | "reverse",
  ): void {
    const permission =
      action === "read"
        ? "finance.read"
        : action === "write"
          ? "finance.write"
          : "finance.reverse";
    if (!hasPermission(role, permission)) {
      throw new LoanPermissionError();
    }
  }

  private async writeAudit(
    context: ProposalActorContext,
    entityId: string,
    action: string,
    details?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.audit.write({
      tenantId: context.tenantId,
      actorId: context.userId,
      action,
      entityType: "loan",
      entityId,
      ...(details ? { details } : {}),
    });
  }
}
