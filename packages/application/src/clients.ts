import {
  assertTenantAccess,
  hasPermission,
  normalizeClientDraft,
  type AppRole,
  type ClientDraft,
  type ClientStatus,
} from "@control-premium/domain";

export type UserContext = Readonly<{
  userId: string;
  tenantId: string;
  role: AppRole;
}>;

export type ClientRecord = Readonly<{
  id: string;
  tenantId: string;
  fullName: string;
  cpf?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  status: ClientStatus;
  createdBy: string;
  archivedAt?: string;
}>;

export interface ClientRepository {
  findById(tenantId: string, clientId: string): Promise<ClientRecord | null>;
  findByCpf(tenantId: string, cpf: string): Promise<ClientRecord | null>;
  search(tenantId: string, query: string): Promise<readonly ClientRecord[]>;
  create(client: ClientRecord): Promise<ClientRecord>;
  update(
    tenantId: string,
    clientId: string,
    changes: Partial<ClientRecord>,
  ): Promise<ClientRecord>;
}

export interface AuditWriter {
  write(event: {
    tenantId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Readonly<Record<string, unknown>>;
  }): Promise<void>;
}

export interface ClientDocumentStorage {
  put(input: {
    path: string;
    contentType: string;
    bytes: Uint8Array;
  }): Promise<{ sha256: string }>;
}

export class ClientAlreadyExistsError extends Error {
  constructor() {
    super("Já existe um cliente com este CPF nesta empresa.");
    this.name = "ClientAlreadyExistsError";
  }
}

export class ClientNotFoundError extends Error {
  constructor() {
    super("Cliente não encontrado.");
    this.name = "ClientNotFoundError";
  }
}

export class ClientPermissionError extends Error {
  constructor() {
    super("O usuário não possui permissão para esta operação.");
    this.name = "ClientPermissionError";
  }
}

export class ClientDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientDocumentError";
  }
}

export class ClientService {
  constructor(
    private readonly clients: ClientRepository,
    private readonly audit: AuditWriter,
    private readonly documents: ClientDocumentStorage,
    private readonly createId: () => string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async create(
    context: UserContext,
    input: ClientDraft,
  ): Promise<ClientRecord> {
    this.requirePermission(context.role, "write");
    const normalized = normalizeClientDraft(input);

    if (
      normalized.cpf &&
      (await this.clients.findByCpf(context.tenantId, normalized.cpf))
    ) {
      throw new ClientAlreadyExistsError();
    }

    const client = await this.clients.create({
      id: this.createId(),
      tenantId: context.tenantId,
      ...normalized,
      status: "under_review",
      createdBy: context.userId,
    });

    await this.audit.write({
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "client.created",
      entityType: "client",
      entityId: client.id,
    });

    return client;
  }

  async get(context: UserContext, clientId: string): Promise<ClientRecord> {
    this.requirePermission(context.role, "read");
    const client = await this.clients.findById(context.tenantId, clientId);

    if (!client) {
      throw new ClientNotFoundError();
    }

    assertTenantAccess(context.tenantId, client.tenantId);
    return client;
  }

  async search(
    context: UserContext,
    query: string,
  ): Promise<readonly ClientRecord[]> {
    this.requirePermission(context.role, "read");
    const clients = await this.clients.search(
      context.tenantId,
      query.trim().toLowerCase(),
    );

    for (const client of clients) {
      assertTenantAccess(context.tenantId, client.tenantId);
    }

    return clients;
  }

  async update(
    context: UserContext,
    clientId: string,
    input: ClientDraft,
  ): Promise<ClientRecord> {
    this.requirePermission(context.role, "write");
    const current = await this.get(context, clientId);
    const normalized = normalizeClientDraft(input);

    if (normalized.cpf && normalized.cpf !== current.cpf) {
      const duplicate = await this.clients.findByCpf(
        context.tenantId,
        normalized.cpf,
      );
      if (duplicate && duplicate.id !== clientId) {
        throw new ClientAlreadyExistsError();
      }
    }

    const client = await this.clients.update(context.tenantId, clientId, {
      ...normalized,
    });

    await this.audit.write({
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "client.updated",
      entityType: "client",
      entityId: client.id,
    });

    return client;
  }

  async archive(context: UserContext, clientId: string): Promise<ClientRecord> {
    this.requirePermission(context.role, "write");
    await this.get(context, clientId);

    const client = await this.clients.update(context.tenantId, clientId, {
      status: "archived",
      archivedAt: this.now(),
    });

    await this.audit.write({
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "client.archived",
      entityType: "client",
      entityId: client.id,
    });

    return client;
  }

  async attachDocument(
    context: UserContext,
    clientId: string,
    input: {
      documentId: string;
      contentType: "image/jpeg" | "image/png" | "application/pdf";
      bytes: Uint8Array;
    },
  ): Promise<{ path: string; sha256: string }> {
    this.requirePermission(context.role, "write");
    await this.get(context, clientId);

    if (input.bytes.byteLength === 0 || input.bytes.byteLength > 10_485_760) {
      throw new ClientDocumentError(
        "O documento deve possuir no máximo 10 MB.",
      );
    }

    const path = `${context.tenantId}/clients/${clientId}/${input.documentId}`;
    const stored = await this.documents.put({
      path,
      contentType: input.contentType,
      bytes: input.bytes,
    });

    await this.audit.write({
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "client.document.attached",
      entityType: "client",
      entityId: clientId,
      details: { path, sha256: stored.sha256 },
    });

    return { path, sha256: stored.sha256 };
  }

  private requirePermission(role: AppRole, action: "read" | "write"): void {
    const allowed = hasPermission(
      role,
      action === "read" ? "clients.read" : "clients.write",
    );

    if (!allowed) {
      throw new ClientPermissionError();
    }
  }
}
