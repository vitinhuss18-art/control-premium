import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";

import {
  allocatePayment,
  calculateOutstandingCents,
  reversePaymentAllocations,
} from "@control-premium/domain";

import {
  LoanConcurrencyError,
  LoanPermissionError,
  LoanService,
  type LoanPayment,
  type LoanRecord,
  type LoanRepository,
  type PaymentMutationResult,
} from "../src/loans";
import type {
  ProposalActorContext,
  ProposalAuditWriter,
  ProposalRecord,
} from "../src/proposals";

class MemoryAudit implements ProposalAuditWriter {
  events: Parameters<ProposalAuditWriter["write"]>[0][] = [];
  async write(event: Parameters<ProposalAuditWriter["write"]>[0]) {
    this.events.push(event);
  }
}

class MemoryLoans implements LoanRepository {
  records = new Map<string, LoanRecord>();
  receiptSequence = 0;

  async findById(tenantId: string, loanId: string) {
    const record = this.records.get(loanId);
    return record?.tenantId === tenantId ? record : null;
  }

  async findByProposalId(tenantId: string, proposalId: string) {
    return (
      [...this.records.values()].find(
        (record) =>
          record.tenantId === tenantId && record.proposalId === proposalId,
      ) ?? null
    );
  }

  async create(loan: LoanRecord) {
    this.records.set(loan.id, loan);
    return loan;
  }

  async recordPayment(
    input: Parameters<LoanRepository["recordPayment"]>[0],
  ): Promise<PaymentMutationResult> {
    const loan = await this.findById(input.tenantId, input.loanId);
    if (!loan) throw new Error("loan missing");

    const existing = loan.payments.find(
      (payment) => payment.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return { loan, payment: existing, duplicate: true };
    if (loan.version !== input.expectedVersion) {
      throw new LoanConcurrencyError();
    }

    const allocation = allocatePayment(
      loan.installments,
      input.amountCents,
      input.paidAt.slice(0, 10),
    );
    this.receiptSequence += 1;
    const payment: LoanPayment = {
      id: "payment-" + this.receiptSequence,
      idempotencyKey: input.idempotencyKey,
      amountCents: input.amountCents,
      allocations: allocation.allocations,
      receiptNumber: "R-" + String(this.receiptSequence).padStart(8, "0"),
      status: "confirmed",
      paidAt: input.paidAt,
      createdBy: input.actorId,
    };
    const updated: LoanRecord = {
      ...loan,
      installments: allocation.installments,
      payments: [...loan.payments, payment],
      status: allocation.outstandingCents === 0 ? "settled" : "active",
      version: loan.version + 1,
    };
    this.records.set(loan.id, updated);
    return { loan: updated, payment, duplicate: false };
  }

  async reversePayment(
    input: Parameters<LoanRepository["reversePayment"]>[0],
  ): Promise<PaymentMutationResult> {
    const loan = await this.findById(input.tenantId, input.loanId);
    if (!loan) throw new Error("loan missing");
    const payment = loan.payments.find(
      (candidate) => candidate.id === input.paymentId,
    );
    if (!payment) throw new Error("payment missing");
    if (payment.status === "reversed") {
      return { loan, payment, duplicate: true };
    }
    if (loan.version !== input.expectedVersion) {
      throw new LoanConcurrencyError();
    }

    const reversed: LoanPayment = {
      ...payment,
      status: "reversed",
      reversedAt: input.reversedAt,
      reversedBy: input.actorId,
      reversalReason: input.reason,
    };
    const updated: LoanRecord = {
      ...loan,
      installments: reversePaymentAllocations(
        loan.installments,
        payment.allocations,
        input.reversedAt.slice(0, 10),
      ),
      payments: loan.payments.map((candidate) =>
        candidate.id === payment.id ? reversed : candidate,
      ),
      status: "active",
      version: loan.version + 1,
    };
    this.records.set(loan.id, updated);
    return { loan: updated, payment: reversed, duplicate: false };
  }
}

const admin: ProposalActorContext = {
  userId: "admin-a",
  tenantId: "tenant-a",
  role: "admin",
};

function approvedProposal(): ProposalRecord {
  return {
    id: "proposal-1",
    tenantId: "tenant-a",
    clientId: "client-1",
    purpose: "working_capital",
    simulation: {
      principalCents: 100_000,
      interestCents: 10_000,
      totalCents: 110_000,
      periodicInterestBps: 250,
      installmentCount: 4,
      frequency: "monthly",
      installments: [1, 2, 3, 4].map((number) => ({
        number,
        dueDate: "2026-" + String(7 + number).padStart(2, "0") + "-10",
        amountCents: 27_500,
      })),
    },
    checklist: [],
    status: "approved",
    validUntil: "2026-08-24T23:59:59.000Z",
    createdBy: "operator-a",
    createdAt: "2026-07-24T12:00:00.000Z",
    updatedAt: "2026-07-24T12:00:00.000Z",
    review: {
      reviewerId: "manager-a",
      opinion: "Análise manual concluída com documentação verificada.",
      score: {
        value: 80,
        riskBand: "low",
        factors: [],
        requiresHumanDecision: true,
      },
      reviewedAt: "2026-07-24T12:00:00.000Z",
    },
    decision: {
      outcome: "approved",
      decidedBy: "manager-a",
      decidedAt: "2026-07-24T12:00:00.000Z",
    },
  };
}

describe("LoanService", () => {
  let repository: MemoryLoans;
  let audit: MemoryAudit;
  let service: LoanService;

  beforeEach(() => {
    repository = new MemoryLoans();
    audit = new MemoryAudit();
    service = new LoanService(
      repository,
      audit,
      () => "loan-1",
      () => new Date("2026-07-24T12:00:00.000Z"),
    );
  });

  it("converte proposta aprovada uma única vez", async () => {
    const first = await service.createFromApprovedProposal(
      admin,
      approvedProposal(),
    );
    const second = await service.createFromApprovedProposal(
      admin,
      approvedProposal(),
    );

    assert.equal(first.id, second.id);
    assert.equal(first.contractedTotalCents, 110_000);
    assert.equal(
      audit.events.filter((e) => e.action === "loan.created").length,
      1,
    );
  });

  it("registra pagamento idempotente com recibo numerado", async () => {
    await service.createFromApprovedProposal(admin, approvedProposal());
    const input = {
      amountCents: 30_000,
      idempotencyKey: "payment:bank:123",
      paidAt: "2026-08-11T12:00:00.000Z",
    };
    const first = await service.registerPayment(admin, "loan-1", input);
    const second = await service.registerPayment(admin, "loan-1", input);

    assert.equal(first.payment.receiptNumber, "R-00000001");
    assert.equal(second.duplicate, true);
    assert.equal(second.loan.payments.length, 1);
    assert.equal(calculateOutstandingCents(second.loan.installments), 80_000);
    assert.equal(
      audit.events.filter((e) => e.action === "loan.payment.confirmed").length,
      1,
    );
  });

  it("quita antecipadamente somente pelo saldo atual", async () => {
    await service.createFromApprovedProposal(admin, approvedProposal());
    await service.registerPayment(admin, "loan-1", {
      amountCents: 10_000,
      idempotencyKey: "payment:partial:1",
      paidAt: "2026-07-24T12:00:00.000Z",
    });
    const quote = await service.quoteEarlyPayoff(admin, "loan-1");
    assert.equal(quote.amountCents, 100_000);

    const settlement = await service.settleEarly(admin, "loan-1", {
      quoteAmountCents: 100_000,
      idempotencyKey: "payment:settlement:1",
    });
    assert.equal(settlement.loan.status, "settled");
  });

  it("estorna com autorização, justificativa e auditoria", async () => {
    await service.createFromApprovedProposal(admin, approvedProposal());
    const paid = await service.registerPayment(admin, "loan-1", {
      amountCents: 30_000,
      idempotencyKey: "payment:reversible:1",
      paidAt: "2026-08-11T12:00:00.000Z",
    });
    const reversed = await service.reversePayment(
      admin,
      "loan-1",
      paid.payment.id,
      "Pagamento confirmado em duplicidade pelo provedor.",
    );

    assert.equal(reversed.payment.status, "reversed");
    assert.equal(
      calculateOutstandingCents(reversed.loan.installments),
      110_000,
    );
    assert.equal(audit.events.at(-1)?.action, "loan.payment.reversed");
  });

  it("bloqueia escrita financeira para perfil sem permissão", async () => {
    const client = { ...admin, userId: "client-a", role: "client" as const };
    await assert.rejects(
      service.createFromApprovedProposal(client, approvedProposal()),
      LoanPermissionError,
    );
  });
});
