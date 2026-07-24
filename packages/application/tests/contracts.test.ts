import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";

import {
  ContractPermissionError,
  ContractService,
  ContractStateError,
  type ContractPdfGenerator,
  type ContractRecord,
  type ContractRepository,
  type ElectronicSignatureProvider,
  type ImmutableContractStorage,
} from "../src/contracts";
import type { LoanRecord } from "../src/loans";
import type {
  ProposalActorContext,
  ProposalAuditWriter,
} from "../src/proposals";

class MemoryContracts implements ContractRepository {
  records = new Map<string, ContractRecord>();
  async findById(tenantId: string, contractId: string) {
    const record = this.records.get(contractId);
    return record?.tenantId === tenantId ? record : null;
  }
  async findSignedByLoan(tenantId: string, loanId: string) {
    return (
      [...this.records.values()].find(
        (record) =>
          record.tenantId === tenantId &&
          record.loanId === loanId &&
          record.status === "signed",
      ) ?? null
    );
  }
  async create(contract: ContractRecord) {
    this.records.set(contract.id, contract);
    return contract;
  }
  async update(
    tenantId: string,
    contractId: string,
    changes: Partial<ContractRecord>,
  ) {
    const current = await this.findById(tenantId, contractId);
    if (!current) throw new Error("missing contract");
    const updated = { ...current, ...changes } as ContractRecord;
    this.records.set(contractId, updated);
    return updated;
  }
}

class FakePdf implements ContractPdfGenerator {
  async generate(input: { content: string }) {
    return new TextEncoder().encode("%PDF-FAKE\n" + input.content);
  }
}

class MemoryStorage implements ImmutableContractStorage {
  paths: string[] = [];
  async put(input: Parameters<ImmutableContractStorage["put"]>[0]) {
    this.paths.push(input.path);
    return { sha256: "sha256-" + input.bytes.byteLength };
  }
}

class FakeSignatures implements ElectronicSignatureProvider {
  async createEnvelope() {
    return { envelopeId: "envelope-1" };
  }
  async verifyCompletion() {
    return {
      envelopeId: "envelope-1",
      signedPdf: new TextEncoder().encode("%PDF-SIGNED"),
      evidence: [
        {
          signerId: "client-1",
          signedAt: "2026-07-24T13:00:00.000Z",
          consentReference: "consent-1",
          providerEvidenceId: "evidence-1",
        },
      ],
    };
  }
}

class MemoryAudit implements ProposalAuditWriter {
  events: Parameters<ProposalAuditWriter["write"]>[0][] = [];
  async write(event: Parameters<ProposalAuditWriter["write"]>[0]) {
    this.events.push(event);
  }
}

const admin: ProposalActorContext = {
  userId: "admin-a",
  tenantId: "tenant-a",
  role: "admin",
};

function activeLoan(): LoanRecord {
  return {
    id: "loan-1",
    tenantId: "tenant-a",
    proposalId: "proposal-1",
    clientId: "client-1",
    principalCents: 100_000,
    contractedTotalCents: 110_000,
    installments: [],
    payments: [],
    status: "active",
    version: 1,
    createdAt: "2026-07-24T12:00:00.000Z",
    createdBy: "admin-a",
  };
}

const template = {
  id: "loan-standard",
  version: 1,
  body: "Cliente {{client.name}}, empréstimo {{loan.id}}.",
  requiredFields: ["client.name", "loan.id"],
};

describe("ContractService", () => {
  let repository: MemoryContracts;
  let storage: MemoryStorage;
  let audit: MemoryAudit;
  let sequence: number;
  let service: ContractService;

  beforeEach(() => {
    repository = new MemoryContracts();
    storage = new MemoryStorage();
    audit = new MemoryAudit();
    sequence = 0;
    service = new ContractService(
      repository,
      new FakePdf(),
      storage,
      new FakeSignatures(),
      audit,
      () => "contract-" + ++sequence,
      () => new Date("2026-07-24T12:00:00.000Z"),
    );
  });

  it("gera e armazena versão original imutável", async () => {
    const contract = await service.createForLoan(
      admin,
      activeLoan(),
      template,
      { "client.name": "Cliente Teste", "loan.id": "loan-1" },
    );

    assert.equal(contract.status, "draft");
    assert.equal(contract.version, 1);
    assert.match(contract.original.path, /original\.pdf$/);
    assert.equal(audit.events[0]?.action, "contract.created");
  });

  it("envia, verifica evidências e guarda o assinado", async () => {
    const contract = await service.createForLoan(
      admin,
      activeLoan(),
      template,
      { "client.name": "Cliente Teste", "loan.id": "loan-1" },
    );
    await service.sendForSignature(
      admin,
      contract.id,
      new TextEncoder().encode("%PDF"),
      [{ id: "client-1", name: "Cliente Teste", contact: "cliente@test.invalid" }],
    );
    const signed = await service.completeSignature(admin, contract.id, {
      provider: "verified-payload",
    });

    assert.equal(signed.status, "signed");
    assert.match(signed.signed?.path ?? "", /signed\.pdf$/);
    assert.equal(signed.signatureEvidence?.length, 1);
    assert.equal(await service.canDisburse(admin, "loan-1"), true);
  });

  it("bloqueia liberação sem contrato assinado", async () => {
    await service.createForLoan(admin, activeLoan(), template, {
      "client.name": "Cliente Teste",
      "loan.id": "loan-1",
    });
    assert.equal(await service.canDisburse(admin, "loan-1"), false);
  });

  it("cria aditivo somente sobre contrato assinado", async () => {
    const parent = await service.createForLoan(
      admin,
      activeLoan(),
      template,
      { "client.name": "Cliente Teste", "loan.id": "loan-1" },
    );
    await assert.rejects(
      service.createAddendum(
        admin,
        activeLoan(),
        parent.id,
        template,
        { "client.name": "Cliente Teste", "loan.id": "loan-1" },
      ),
      ContractStateError,
    );
  });

  it("aplica permissão e isolamento", async () => {
    const client = { ...admin, role: "client" as const };
    await assert.rejects(
      service.createForLoan(client, activeLoan(), template, {
        "client.name": "Cliente Teste",
        "loan.id": "loan-1",
      }),
      ContractPermissionError,
    );
  });
});
