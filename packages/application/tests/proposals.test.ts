import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";

import {
  ProposalPermissionError,
  ProposalService,
  ProposalStateError,
  type ProposalActorContext,
  type ProposalApprovalPolicy,
  type ProposalAuditWriter,
  type ProposalRecord,
  type ProposalRepository,
} from "../src/proposals";

class MemoryProposalRepository implements ProposalRepository {
  records = new Map<string, ProposalRecord>();

  async findById(
    tenantId: string,
    proposalId: string,
  ): Promise<ProposalRecord | null> {
    const record = this.records.get(proposalId);
    if (!record || record.tenantId !== tenantId) return null;
    return record;
  }

  async create(proposal: ProposalRecord): Promise<ProposalRecord> {
    this.records.set(proposal.id, proposal);
    return proposal;
  }

  async update(
    tenantId: string,
    proposalId: string,
    changes: Partial<ProposalRecord>,
  ): Promise<ProposalRecord> {
    const current = await this.findById(tenantId, proposalId);
    if (!current) throw new Error("proposal missing");
    const updated = { ...current, ...changes } as ProposalRecord;
    this.records.set(proposalId, updated);
    return updated;
  }
}

class MemoryProposalAudit implements ProposalAuditWriter {
  events: Parameters<ProposalAuditWriter["write"]>[0][] = [];

  async write(event: Parameters<ProposalAuditWriter["write"]>[0]) {
    this.events.push(event);
  }
}

class TestApprovalPolicy implements ProposalApprovalPolicy {
  canApprove(input: {
    role: ProposalActorContext["role"];
    principalCents: number;
    totalCents: number;
  }): boolean {
    if (input.role === "super_admin" || input.role === "admin") return true;
    return input.role === "manager" && input.totalCents <= 200_000;
  }
}

const operator: ProposalActorContext = {
  userId: "operator-a",
  tenantId: "tenant-a",
  role: "operator",
};
const manager: ProposalActorContext = {
  userId: "manager-a",
  tenantId: "tenant-a",
  role: "manager",
};

function verifiedChecklist(proposal: ProposalRecord) {
  return proposal.checklist.map((item) => ({
    ...item,
    status: "verified" as const,
    verifiedBy: "manager-a",
    verifiedAt: "2026-07-24T12:00:00.000Z",
  }));
}

describe("ProposalService", () => {
  let repository: MemoryProposalRepository;
  let audit: MemoryProposalAudit;
  let currentTime: Date;
  let service: ProposalService;

  beforeEach(() => {
    repository = new MemoryProposalRepository();
    audit = new MemoryProposalAudit();
    currentTime = new Date("2026-07-24T12:00:00.000Z");
    service = new ProposalService(
      repository,
      audit,
      new TestApprovalPolicy(),
      () => "proposal-1",
      () => currentTime,
    );
  });

  async function createDraft(principalCents = 100_000) {
    return service.createDraft(operator, {
      clientId: "client-1",
      purpose: "working_capital",
      simulation: {
        principalCents,
        installmentCount: 4,
        periodicInterestBps: 250,
        frequency: "monthly",
        firstDueDate: "2026-08-10",
      },
      validUntil: "2026-08-24T23:59:59.000Z",
    });
  }

  it("cria, documenta, envia, analisa e aprova com auditoria", async () => {
    const draft = await createDraft();
    assert.equal(draft.status, "draft");
    assert.equal(audit.events[0]?.action, "proposal.created");

    await assert.rejects(
      service.submit(operator, draft.id),
      ProposalStateError,
    );

    await service.updateChecklist(operator, draft.id, verifiedChecklist(draft));
    await service.submit(operator, draft.id);
    await service.review(manager, draft.id, {
      opinion:
        "Documentação conferida e capacidade de pagamento analisada manualmente.",
      score: {
        identityVerified: true,
        addressVerified: true,
        incomeVerified: true,
        relationshipMonths: 24,
        debtToIncomeBps: 3_000,
      },
    });
    const approved = await service.decide(manager, draft.id, {
      outcome: "approved",
      reason: "Parecer manual favorável e dentro da alçada configurada.",
    });

    assert.equal(approved.status, "approved");
    assert.equal(approved.review?.score.requiresHumanDecision, true);
    assert.equal(approved.decision?.decidedBy, manager.userId);
    assert.deepEqual(
      audit.events.map((event) => event.action),
      [
        "proposal.created",
        "proposal.checklist.updated",
        "proposal.submitted",
        "proposal.reviewed",
        "proposal.approved",
      ],
    );
  });

  it("exige alçada configurada e permissão de aprovação", async () => {
    const draft = await createDraft(300_000);
    await service.updateChecklist(operator, draft.id, verifiedChecklist(draft));
    await service.submit(operator, draft.id);

    await assert.rejects(
      service.review(operator, draft.id, {
        opinion: "Tentativa de parecer por usuário sem a permissão necessária.",
        score: {
          identityVerified: true,
          addressVerified: true,
          incomeVerified: true,
          relationshipMonths: 12,
          debtToIncomeBps: 2_000,
        },
      }),
      ProposalPermissionError,
    );

    await service.review(manager, draft.id, {
      opinion: "Parecer humano concluído com documentação e renda verificadas.",
      score: {
        identityVerified: true,
        addressVerified: true,
        incomeVerified: true,
        relationshipMonths: 12,
        debtToIncomeBps: 2_000,
      },
    });
    await assert.rejects(
      service.decide(manager, draft.id, { outcome: "approved" }),
      /alçada/,
    );
  });

  it("recusa somente com motivo objetivo e mantém resumo rastreável", async () => {
    const draft = await createDraft();
    await service.updateChecklist(operator, draft.id, verifiedChecklist(draft));
    await service.submit(operator, draft.id);
    await service.review(manager, draft.id, {
      opinion:
        "Análise manual concluiu que os documentos são válidos, com ressalvas.",
      score: {
        identityVerified: true,
        addressVerified: true,
        incomeVerified: false,
        relationshipMonths: 0,
        debtToIncomeBps: 6_000,
      },
    });

    await assert.rejects(
      service.decide(manager, draft.id, {
        outcome: "rejected",
        reason: "não",
      }),
      /motivo objetivo/,
    );

    const rejected = await service.decide(manager, draft.id, {
      outcome: "rejected",
      reason: "Comprovação de renda insuficiente para o valor solicitado.",
    });
    const summary = service.createClientSummary(rejected);

    assert.equal(summary.status, "rejected");
    assert.equal(summary.totalCents, 110_000);
    assert.match(summary.decisionReason ?? "", /renda insuficiente/);
    assert.equal("score" in summary, false);
  });

  it("bloqueia proposta vencida", async () => {
    const draft = await createDraft();
    await service.updateChecklist(operator, draft.id, verifiedChecklist(draft));
    currentTime = new Date("2026-08-25T00:00:00.000Z");

    await assert.rejects(service.submit(operator, draft.id), /vencida/);
  });
});
