import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  ClientAlreadyExistsError,
  ClientPermissionError,
  ClientService,
  type AuditWriter,
  type ClientDocumentStorage,
  type ClientRecord,
  type ClientRepository,
} from "../src/clients";

class MemoryClients implements ClientRepository {
  records: ClientRecord[] = [];

  async findById(
    tenantId: string,
    clientId: string,
  ): Promise<ClientRecord | null> {
    return (
      this.records.find(
        (client) => client.tenantId === tenantId && client.id === clientId,
      ) ?? null
    );
  }

  async findByCpf(tenantId: string, cpf: string): Promise<ClientRecord | null> {
    return (
      this.records.find(
        (client) => client.tenantId === tenantId && client.cpf === cpf,
      ) ?? null
    );
  }

  async search(
    tenantId: string,
    query: string,
  ): Promise<readonly ClientRecord[]> {
    return this.records.filter(
      (client) =>
        client.tenantId === tenantId &&
        client.fullName.toLowerCase().includes(query),
    );
  }

  async create(client: ClientRecord): Promise<ClientRecord> {
    this.records.push(client);
    return client;
  }

  async update(
    tenantId: string,
    clientId: string,
    changes: Partial<ClientRecord>,
  ): Promise<ClientRecord> {
    const index = this.records.findIndex(
      (client) => client.tenantId === tenantId && client.id === clientId,
    );
    if (index < 0) {
      throw new Error("not found");
    }

    const updated = { ...this.records[index], ...changes } as ClientRecord;
    this.records[index] = updated;
    return updated;
  }
}

class MemoryAudit implements AuditWriter {
  events: Parameters<AuditWriter["write"]>[0][] = [];

  async write(event: Parameters<AuditWriter["write"]>[0]): Promise<void> {
    this.events.push(event);
  }
}

class MemoryDocuments implements ClientDocumentStorage {
  async put(input: {
    path: string;
    contentType: string;
    bytes: Uint8Array;
  }): Promise<{ sha256: string }> {
    return {
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
    };
  }
}

describe("ClientService", () => {
  let clients: MemoryClients;
  let audit: MemoryAudit;
  let service: ClientService;
  let sequence: number;

  const admin = {
    userId: "user-a",
    tenantId: "tenant-a",
    role: "admin" as const,
  };

  beforeEach(() => {
    clients = new MemoryClients();
    audit = new MemoryAudit();
    sequence = 0;
    service = new ClientService(
      clients,
      audit,
      new MemoryDocuments(),
      () => `client-${(sequence += 1)}`,
      () => "2026-07-24T00:00:00.000Z",
    );
  });

  it("cadastra, pesquisa, edita e arquiva com auditoria", async () => {
    const created = await service.create(admin, {
      fullName: "Cliente Fictício",
      cpf: "529.982.247-25",
    });

    expect(await service.search(admin, "fictício")).toEqual([created]);
    expect(
      await service.update(admin, created.id, {
        fullName: "Cliente Atualizado",
        cpf: "52998224725",
      }),
    ).toMatchObject({ fullName: "Cliente Atualizado" });
    expect(await service.archive(admin, created.id)).toMatchObject({
      status: "archived",
    });
    expect(audit.events.map((event) => event.action)).toEqual([
      "client.created",
      "client.updated",
      "client.archived",
    ]);
  });

  it("impede CPF duplicado apenas dentro da mesma empresa", async () => {
    await service.create(admin, {
      fullName: "Cliente Um",
      cpf: "52998224725",
    });

    await expect(
      service.create(admin, {
        fullName: "Cliente Dois",
        cpf: "52998224725",
      }),
    ).rejects.toThrow(ClientAlreadyExistsError);

    await expect(
      service.create(
        { ...admin, tenantId: "tenant-b" },
        { fullName: "Cliente B", cpf: "52998224725" },
      ),
    ).resolves.toMatchObject({ tenantId: "tenant-b" });
  });

  it("impede o perfil cliente de administrar cadastros", async () => {
    await expect(
      service.create(
        { ...admin, role: "client" },
        { fullName: "Cadastro Indevido" },
      ),
    ).rejects.toThrow(ClientPermissionError);
  });

  it("gera caminho privado por empresa e cliente", async () => {
    const client = await service.create(admin, {
      fullName: "Cliente Documento",
    });

    await expect(
      service.attachDocument(admin, client.id, {
        documentId: "document-1",
        contentType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3]),
      }),
    ).resolves.toMatchObject({
      path: "tenant-a/clients/client-1/document-1",
    });
  });
});
