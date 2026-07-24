import {
  assertTenantAccess,
  buildContractStoragePath,
  hasPermission,
  renderContractTemplate,
  type AppRole,
  type ContractTemplate,
} from "@control-premium/domain";

import type { LoanRecord } from "./loans";
import type {
  ProposalActorContext,
  ProposalAuditWriter,
} from "./proposals";

export type ContractDocument = Readonly<{
  path: string;
  sha256: string;
  createdAt: string;
}>;

export type SignatureEvidence = Readonly<{
  signerId: string;
  signedAt: string;
  consentReference: string;
  providerEvidenceId: string;
}>;

export type ContractRecord = Readonly<{
  id: string;
  tenantId: string;
  loanId: string;
  parentContractId?: string;
  version: number;
  status: "draft" | "sent" | "signed" | "voided";
  templateId: string;
  templateVersion: number;
  original: ContractDocument;
  signed?: ContractDocument;
  signatureEnvelopeId?: string;
  signatureEvidence?: readonly SignatureEvidence[];
  createdBy: string;
  createdAt: string;
}>;

export interface ContractRepository {
  findById(
    tenantId: string,
    contractId: string,
  ): Promise<ContractRecord | null>;
  findSignedByLoan(
    tenantId: string,
    loanId: string,
  ): Promise<ContractRecord | null>;
  create(contract: ContractRecord): Promise<ContractRecord>;
  update(
    tenantId: string,
    contractId: string,
    changes: Partial<ContractRecord>,
  ): Promise<ContractRecord>;
}

export interface ContractPdfGenerator {
  generate(input: {
    identifier: string;
    title: string;
    content: string;
  }): Promise<Uint8Array>;
}

export interface ImmutableContractStorage {
  put(input: {
    path: string;
    contentType: "application/pdf";
    bytes: Uint8Array;
    immutable: true;
  }): Promise<{ sha256: string }>;
}

export interface ElectronicSignatureProvider {
  createEnvelope(input: {
    contractId: string;
    pdf: Uint8Array;
    signers: readonly { id: string; name: string; contact: string }[];
  }): Promise<{ envelopeId: string }>;
  verifyCompletion(input: unknown): Promise<{
    envelopeId: string;
    signedPdf: Uint8Array;
    evidence: readonly SignatureEvidence[];
  }>;
}

export class ContractNotFoundError extends Error {
  constructor() {
    super("Contrato não encontrado.");
    this.name = "ContractNotFoundError";
  }
}

export class ContractPermissionError extends Error {
  constructor() {
    super("O usuário não possui permissão para esta operação contratual.");
    this.name = "ContractPermissionError";
  }
}

export class ContractStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractStateError";
  }
}

export class ContractService {
  private readonly contracts: ContractRepository;
  private readonly pdf: ContractPdfGenerator;
  private readonly storage: ImmutableContractStorage;
  private readonly signatures: ElectronicSignatureProvider;
  private readonly audit: ProposalAuditWriter;
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    contracts: ContractRepository,
    pdf: ContractPdfGenerator,
    storage: ImmutableContractStorage,
    signatures: ElectronicSignatureProvider,
    audit: ProposalAuditWriter,
    createId: () => string,
    now: () => Date = () => new Date(),
  ) {
    this.contracts = contracts;
    this.pdf = pdf;
    this.storage = storage;
    this.signatures = signatures;
    this.audit = audit;
    this.createId = createId;
    this.now = now;
  }

  async createForLoan(
    context: ProposalActorContext,
    loan: LoanRecord,
    template: ContractTemplate,
    fields: Readonly<Record<string, string>>,
  ): Promise<ContractRecord> {
    this.requireWrite(context.role);
    assertTenantAccess(context.tenantId, loan.tenantId);
    if (loan.status !== "active") {
      throw new ContractStateError(
        "O contrato exige um empréstimo ativo e aprovado.",
      );
    }

    return this.createVersion(context, loan, template, fields, 1);
  }

  async createAddendum(
    context: ProposalActorContext,
    loan: LoanRecord,
    parentContractId: string,
    template: ContractTemplate,
    fields: Readonly<Record<string, string>>,
  ): Promise<ContractRecord> {
    this.requireWrite(context.role);
    const parent = await this.get(context, parentContractId);
    if (parent.loanId !== loan.id || parent.status !== "signed") {
      throw new ContractStateError(
        "Aditivos exigem um contrato assinado do mesmo empréstimo.",
      );
    }
    return this.createVersion(
      context,
      loan,
      template,
      fields,
      parent.version + 1,
      parent.id,
    );
  }

  async get(
    context: ProposalActorContext,
    contractId: string,
  ): Promise<ContractRecord> {
    if (!hasPermission(context.role, "finance.read")) {
      throw new ContractPermissionError();
    }
    const contract = await this.contracts.findById(
      context.tenantId,
      contractId,
    );
    if (!contract) throw new ContractNotFoundError();
    assertTenantAccess(context.tenantId, contract.tenantId);
    return contract;
  }

  async sendForSignature(
    context: ProposalActorContext,
    contractId: string,
    originalPdf: Uint8Array,
    signers: readonly { id: string; name: string; contact: string }[],
  ): Promise<ContractRecord> {
    this.requireWrite(context.role);
    const contract = await this.get(context, contractId);
    if (contract.status !== "draft") {
      throw new ContractStateError(
        "Somente contratos em rascunho podem ser enviados.",
      );
    }
    if (originalPdf.byteLength === 0 || signers.length === 0) {
      throw new ContractStateError("PDF e signatários são obrigatórios.");
    }
    const envelope = await this.signatures.createEnvelope({
      contractId,
      pdf: originalPdf,
      signers,
    });
    if (!envelope.envelopeId) {
      throw new ContractStateError(
        "O provedor não retornou um envelope de assinatura.",
      );
    }
    const updated = await this.contracts.update(
      context.tenantId,
      contractId,
      {
        status: "sent",
        signatureEnvelopeId: envelope.envelopeId,
      },
    );
    await this.writeAudit(context, contractId, "contract.signature.requested", {
      envelopeId: envelope.envelopeId,
      signerCount: signers.length,
    });
    return updated;
  }

  async completeSignature(
    context: ProposalActorContext,
    contractId: string,
    providerPayload: unknown,
  ): Promise<ContractRecord> {
    this.requireWrite(context.role);
    const contract = await this.get(context, contractId);
    if (
      contract.status !== "sent" ||
      !contract.signatureEnvelopeId
    ) {
      throw new ContractStateError(
        "O contrato não está aguardando assinatura.",
      );
    }
    const completion =
      await this.signatures.verifyCompletion(providerPayload);
    if (
      completion.envelopeId !== contract.signatureEnvelopeId ||
      completion.signedPdf.byteLength === 0 ||
      completion.evidence.length === 0
    ) {
      throw new ContractStateError(
        "A evidência de assinatura não corresponde ao contrato.",
      );
    }
    const path = buildContractStoragePath({
      tenantId: contract.tenantId,
      loanId: contract.loanId,
      contractId: contract.id,
      version: contract.version,
      kind: "signed",
    });
    const stored = await this.storage.put({
      path,
      contentType: "application/pdf",
      bytes: completion.signedPdf,
      immutable: true,
    });
    const signedAt = this.now().toISOString();
    const updated = await this.contracts.update(
      context.tenantId,
      contractId,
      {
        status: "signed",
        signed: { path, sha256: stored.sha256, createdAt: signedAt },
        signatureEvidence: Object.freeze([...completion.evidence]),
      },
    );
    await this.writeAudit(context, contractId, "contract.signed", {
      sha256: stored.sha256,
      evidenceCount: completion.evidence.length,
    });
    return updated;
  }

  async canDisburse(
    context: ProposalActorContext,
    loanId: string,
  ): Promise<boolean> {
    const contract = await this.contracts.findSignedByLoan(
      context.tenantId,
      loanId,
    );
    return Boolean(contract?.signed && contract.signatureEvidence?.length);
  }

  private async createVersion(
    context: ProposalActorContext,
    loan: LoanRecord,
    template: ContractTemplate,
    fields: Readonly<Record<string, string>>,
    version: number,
    parentContractId?: string,
  ): Promise<ContractRecord> {
    assertTenantAccess(context.tenantId, loan.tenantId);
    const contractId = this.createId();
    const rendered = renderContractTemplate(template, fields);
    const bytes = await this.pdf.generate({
      identifier: contractId + ":v" + version,
      title: "Contrato de empréstimo",
      content: rendered.content,
    });
    if (bytes.byteLength === 0) {
      throw new ContractStateError("O gerador retornou um PDF vazio.");
    }
    const path = buildContractStoragePath({
      tenantId: context.tenantId,
      loanId: loan.id,
      contractId,
      version,
      kind: parentContractId ? "addendum" : "original",
    });
    const stored = await this.storage.put({
      path,
      contentType: "application/pdf",
      bytes,
      immutable: true,
    });
    const createdAt = this.now().toISOString();
    const contract = await this.contracts.create({
      id: contractId,
      tenantId: context.tenantId,
      loanId: loan.id,
      ...(parentContractId ? { parentContractId } : {}),
      version,
      status: "draft",
      templateId: rendered.templateId,
      templateVersion: rendered.templateVersion,
      original: { path, sha256: stored.sha256, createdAt },
      createdBy: context.userId,
      createdAt,
    });
    await this.writeAudit(context, contract.id, "contract.created", {
      loanId: loan.id,
      version,
      sha256: stored.sha256,
    });
    return contract;
  }

  private requireWrite(role: AppRole): void {
    if (!hasPermission(role, "finance.write")) {
      throw new ContractPermissionError();
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
      entityType: "contract",
      entityId,
      ...(details ? { details } : {}),
    });
  }
}
