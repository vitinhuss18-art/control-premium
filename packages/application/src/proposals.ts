import {
  assertTenantAccess,
  calculateExplainableCreditScore,
  createProposalChecklist,
  creditPurposes,
  hasPermission,
  isProposalChecklistComplete,
  simulateProposal,
  validateProposalChecklist,
  type AppRole,
  type CreditPurpose,
  type CreditScoreInput,
  type ExplainableCreditScore,
  type ProposalChecklistItem,
  type ProposalSimulation,
  type ProposalSimulationInput,
  type ProposalStatus,
} from "@control-premium/domain";

export type ProposalActorContext = Readonly<{
  userId: string;
  tenantId: string;
  role: AppRole;
}>;

export type ProposalDraftInput = Readonly<{
  clientId: string;
  purpose: CreditPurpose;
  purposeDetails?: string;
  simulation: ProposalSimulationInput;
  validUntil: string;
}>;

export type ProposalReview = Readonly<{
  reviewerId: string;
  opinion: string;
  score: ExplainableCreditScore;
  reviewedAt: string;
}>;

export type ProposalDecision = Readonly<{
  outcome: "approved" | "rejected";
  decidedBy: string;
  reason?: string;
  decidedAt: string;
}>;

export type ProposalRecord = Readonly<{
  id: string;
  tenantId: string;
  clientId: string;
  purpose: CreditPurpose;
  purposeDetails?: string;
  simulation: ProposalSimulation;
  checklist: readonly ProposalChecklistItem[];
  status: ProposalStatus;
  validUntil: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  review?: ProposalReview;
  decision?: ProposalDecision;
}>;

export interface ProposalRepository {
  findById(
    tenantId: string,
    proposalId: string,
  ): Promise<ProposalRecord | null>;
  create(proposal: ProposalRecord): Promise<ProposalRecord>;
  update(
    tenantId: string,
    proposalId: string,
    changes: Partial<ProposalRecord>,
  ): Promise<ProposalRecord>;
}

export interface ProposalAuditWriter {
  write(event: {
    tenantId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Readonly<Record<string, unknown>>;
  }): Promise<void>;
}

export interface ProposalApprovalPolicy {
  canApprove(input: {
    role: AppRole;
    principalCents: number;
    totalCents: number;
  }): boolean;
}

export class ProposalNotFoundError extends Error {
  constructor() {
    super("Proposta não encontrada.");
    this.name = "ProposalNotFoundError";
  }
}

export class ProposalPermissionError extends Error {
  constructor(message = "O usuário não possui permissão para esta operação.") {
    super(message);
    this.name = "ProposalPermissionError";
  }
}

export class ProposalStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalStateError";
  }
}

function normalizePurposeDetails(
  purpose: CreditPurpose,
  details?: string,
): string | undefined {
  if (!creditPurposes.includes(purpose)) {
    throw new ProposalStateError("Finalidade de crédito inválida.");
  }

  const normalized = details?.trim().replace(/\s+/g, " ");
  if (purpose === "other" && (!normalized || normalized.length < 5)) {
    throw new ProposalStateError(
      "Descreva a finalidade quando selecionar a opção outros.",
    );
  }
  if (normalized && normalized.length > 500) {
    throw new ProposalStateError(
      "A descrição da finalidade deve possuir no máximo 500 caracteres.",
    );
  }
  return normalized || undefined;
}

function parseFutureInstant(
  value: string,
  now: Date,
  field: string,
): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime()) || instant.getTime() <= now.getTime()) {
    throw new ProposalStateError(field + " deve indicar uma data futura.");
  }
  return instant.toISOString();
}

function normalizeOpinion(opinion: string): string {
  const normalized = opinion.trim().replace(/\s+/g, " ");
  if (normalized.length < 20 || normalized.length > 2_000) {
    throw new ProposalStateError(
      "O parecer deve possuir entre 20 e 2.000 caracteres.",
    );
  }
  return normalized;
}

function normalizeDecisionReason(
  outcome: "approved" | "rejected",
  reason?: string,
): string | undefined {
  const normalized = reason?.trim().replace(/\s+/g, " ");
  if (outcome === "rejected" && (!normalized || normalized.length < 10)) {
    throw new ProposalStateError(
      "A recusa exige um motivo objetivo e não discriminatório.",
    );
  }
  if (normalized && normalized.length > 1_000) {
    throw new ProposalStateError(
      "O motivo da decisão deve possuir no máximo 1.000 caracteres.",
    );
  }
  return normalized || undefined;
}

export class ProposalService {
  private readonly proposals: ProposalRepository;
  private readonly audit: ProposalAuditWriter;
  private readonly approvalPolicy: ProposalApprovalPolicy;
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    proposals: ProposalRepository,
    audit: ProposalAuditWriter,
    approvalPolicy: ProposalApprovalPolicy,
    createId: () => string,
    now: () => Date = () => new Date(),
  ) {
    this.proposals = proposals;
    this.audit = audit;
    this.approvalPolicy = approvalPolicy;
    this.createId = createId;
    this.now = now;
  }

  async createDraft(
    context: ProposalActorContext,
    input: ProposalDraftInput,
  ): Promise<ProposalRecord> {
    this.requirePermission(context.role, "write");
    if (!input.clientId.trim()) {
      throw new ProposalStateError("Informe o cliente da proposta.");
    }

    const createdAt = this.now();
    const proposal = await this.proposals.create({
      id: this.createId(),
      tenantId: context.tenantId,
      clientId: input.clientId.trim(),
      purpose: input.purpose,
      ...(normalizePurposeDetails(input.purpose, input.purposeDetails)
        ? {
            purposeDetails: normalizePurposeDetails(
              input.purpose,
              input.purposeDetails,
            ),
          }
        : {}),
      simulation: simulateProposal(input.simulation),
      checklist: createProposalChecklist(),
      status: "draft",
      validUntil: parseFutureInstant(
        input.validUntil,
        createdAt,
        "A validade da proposta",
      ),
      createdBy: context.userId,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    });

    await this.writeAudit(context, proposal.id, "proposal.created", {
      clientId: proposal.clientId,
      principalCents: proposal.simulation.principalCents,
      installmentCount: proposal.simulation.installmentCount,
    });
    return proposal;
  }

  async get(
    context: ProposalActorContext,
    proposalId: string,
  ): Promise<ProposalRecord> {
    this.requirePermission(context.role, "read");
    const proposal = await this.proposals.findById(
      context.tenantId,
      proposalId,
    );
    if (!proposal) {
      throw new ProposalNotFoundError();
    }
    assertTenantAccess(context.tenantId, proposal.tenantId);
    return proposal;
  }

  async updateChecklist(
    context: ProposalActorContext,
    proposalId: string,
    checklist: readonly ProposalChecklistItem[],
  ): Promise<ProposalRecord> {
    this.requirePermission(context.role, "write");
    const proposal = await this.get(context, proposalId);
    if (proposal.status !== "draft") {
      throw new ProposalStateError(
        "O checklist só pode ser alterado enquanto a proposta está em rascunho.",
      );
    }

    const updated = await this.proposals.update(
      context.tenantId,
      proposal.id,
      {
        checklist: validateProposalChecklist(checklist),
        updatedAt: this.now().toISOString(),
      },
    );
    await this.writeAudit(context, proposal.id, "proposal.checklist.updated");
    return updated;
  }

  async submit(
    context: ProposalActorContext,
    proposalId: string,
  ): Promise<ProposalRecord> {
    this.requirePermission(context.role, "write");
    const proposal = await this.get(context, proposalId);
    if (proposal.status !== "draft") {
      throw new ProposalStateError(
        "Somente propostas em rascunho podem ser enviadas para análise.",
      );
    }
    this.assertNotExpired(proposal);
    if (!isProposalChecklistComplete(proposal.checklist)) {
      throw new ProposalStateError(
        "Verifique todo o checklist documental antes de enviar a proposta.",
      );
    }

    const updated = await this.proposals.update(
      context.tenantId,
      proposal.id,
      { status: "submitted", updatedAt: this.now().toISOString() },
    );
    await this.writeAudit(context, proposal.id, "proposal.submitted");
    return updated;
  }

  async review(
    context: ProposalActorContext,
    proposalId: string,
    input: { opinion: string; score: CreditScoreInput },
  ): Promise<ProposalRecord> {
    this.requirePermission(context.role, "approve");
    const proposal = await this.get(context, proposalId);
    if (
      proposal.status !== "submitted" &&
      proposal.status !== "under_review"
    ) {
      throw new ProposalStateError(
        "A proposta precisa estar enviada ou em análise.",
      );
    }
    this.assertNotExpired(proposal);

    const review: ProposalReview = {
      reviewerId: context.userId,
      opinion: normalizeOpinion(input.opinion),
      score: calculateExplainableCreditScore(input.score),
      reviewedAt: this.now().toISOString(),
    };
    const updated = await this.proposals.update(
      context.tenantId,
      proposal.id,
      {
        status: "under_review",
        review,
        updatedAt: this.now().toISOString(),
      },
    );
    await this.writeAudit(context, proposal.id, "proposal.reviewed", {
      score: review.score.value,
      riskBand: review.score.riskBand,
    });
    return updated;
  }

  async decide(
    context: ProposalActorContext,
    proposalId: string,
    input: { outcome: "approved" | "rejected"; reason?: string },
  ): Promise<ProposalRecord> {
    this.requirePermission(context.role, "approve");
    const proposal = await this.get(context, proposalId);
    if (proposal.status !== "under_review" || !proposal.review) {
      throw new ProposalStateError(
        "A proposta exige parecer humano antes da decisão.",
      );
    }
    this.assertNotExpired(proposal);
    if (
      !this.approvalPolicy.canApprove({
        role: context.role,
        principalCents: proposal.simulation.principalCents,
        totalCents: proposal.simulation.totalCents,
      })
    ) {
      throw new ProposalPermissionError(
        "O valor ultrapassa a alçada deste usuário.",
      );
    }

    const reason = normalizeDecisionReason(input.outcome, input.reason);
    const decision: ProposalDecision = {
      outcome: input.outcome,
      decidedBy: context.userId,
      ...(reason ? { reason } : {}),
      decidedAt: this.now().toISOString(),
    };
    const updated = await this.proposals.update(
      context.tenantId,
      proposal.id,
      {
        status: input.outcome,
        decision,
        updatedAt: this.now().toISOString(),
      },
    );
    await this.writeAudit(context, proposal.id, "proposal." + input.outcome, {
      reason: reason ?? null,
    });
    return updated;
  }

  createClientSummary(proposal: ProposalRecord): Readonly<{
    proposalId: string;
    status: ProposalStatus;
    purpose: CreditPurpose;
    principalCents: number;
    interestCents: number;
    totalCents: number;
    installmentCount: number;
    installments: ProposalSimulation["installments"];
    validUntil: string;
    decisionReason?: string;
  }> {
    return Object.freeze({
      proposalId: proposal.id,
      status: proposal.status,
      purpose: proposal.purpose,
      principalCents: proposal.simulation.principalCents,
      interestCents: proposal.simulation.interestCents,
      totalCents: proposal.simulation.totalCents,
      installmentCount: proposal.simulation.installmentCount,
      installments: proposal.simulation.installments,
      validUntil: proposal.validUntil,
      ...(proposal.decision?.reason
        ? { decisionReason: proposal.decision.reason }
        : {}),
    });
  }

  private assertNotExpired(proposal: ProposalRecord): void {
    if (new Date(proposal.validUntil).getTime() <= this.now().getTime()) {
      throw new ProposalStateError("A proposta está vencida.");
    }
  }

  private requirePermission(
    role: AppRole,
    action: "read" | "write" | "approve",
  ): void {
    const permission =
      action === "read"
        ? "proposals.read"
        : action === "write"
          ? "proposals.write"
          : "proposals.approve";
    if (!hasPermission(role, permission)) {
      throw new ProposalPermissionError();
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
      entityType: "proposal",
      entityId,
      ...(details ? { details } : {}),
    });
  }
}
