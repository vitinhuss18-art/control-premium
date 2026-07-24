import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import type { AuditWriter, ClientRecord } from "../src/clients";
import {
  RegistrationInvitationError,
  RegistrationInvitationPermissionError,
  RegistrationInvitationService,
  type RegistrationDelivery,
  type RegistrationInvitation,
  type RegistrationInvitationRepository,
  type RegistrationTokenCodec,
} from "../src/invitations";

class MemoryInvitations implements RegistrationInvitationRepository {
  invitations: RegistrationInvitation[] = [];
  deliveries: RegistrationDelivery[] = [];
  client: ClientRecord = {
    id: "client-1",
    tenantId: "tenant-a",
    fullName: "Cadastro Inicial",
    phone: "11999998888",
    status: "under_review",
    createdBy: "user-a",
  };

  async createWithDelivery(
    invitation: RegistrationInvitation,
    delivery: RegistrationDelivery,
  ): Promise<void> {
    this.invitations.push(invitation);
    this.deliveries.push(delivery);
  }

  async findPendingByTokenHash(
    tokenHash: string,
  ): Promise<RegistrationInvitation | null> {
    return (
      this.invitations.find(
        (invitation) =>
          invitation.tokenHash === tokenHash && invitation.status === "pending",
      ) ?? null
    );
  }

  async consumeAndUpdateClient(
    input: Parameters<
      RegistrationInvitationRepository["consumeAndUpdateClient"]
    >[0],
  ): Promise<ClientRecord | null> {
    const index = this.invitations.findIndex(
      (invitation) =>
        invitation.id === input.invitationId &&
        invitation.tokenHash === input.tokenHash &&
        invitation.status === "pending",
    );
    if (index < 0) return null;

    this.invitations[index] = {
      ...this.invitations[index],
      status: "consumed",
    } as RegistrationInvitation;
    this.client = { ...this.client, ...input.client };
    return this.client;
  }
}

class DeterministicTokens implements RegistrationTokenCodec {
  readonly raw = "token-seguro-com-mais-de-trinta-e-dois-caracteres";

  generate(): string {
    return this.raw;
  }

  async hash(token: string): Promise<string> {
    return createHash("sha256").update(token).digest("hex");
  }
}

class MemoryAudit implements AuditWriter {
  events: Parameters<AuditWriter["write"]>[0][] = [];

  async write(event: Parameters<AuditWriter["write"]>[0]): Promise<void> {
    this.events.push(event);
  }
}

describe("RegistrationInvitationService", () => {
  let repository: MemoryInvitations;
  let tokens: DeterministicTokens;
  let audit: MemoryAudit;
  let currentTime: Date;
  let service: RegistrationInvitationService;

  const admin = {
    userId: "user-a",
    tenantId: "tenant-a",
    role: "admin" as const,
  };

  beforeEach(() => {
    repository = new MemoryInvitations();
    tokens = new DeterministicTokens();
    audit = new MemoryAudit();
    currentTime = new Date("2026-07-24T12:00:00.000Z");
    service = new RegistrationInvitationService(
      repository,
      tokens,
      audit,
      () => "invitation-1",
      "https://app.controlpremium.test/cadastro",
      () => currentTime,
    );
  });

  it("persiste somente o hash e agenda a entrega por WhatsApp", async () => {
    await expect(
      service.issue(admin, repository.client),
    ).resolves.toMatchObject({
      invitationId: "invitation-1",
      expiresAt: "2026-07-25T12:00:00.000Z",
    });

    expect(repository.invitations[0]?.tokenHash).not.toBe(tokens.raw);
    expect(repository.deliveries[0]).toMatchObject({
      channel: "whatsapp",
      recipient: "+5511999998888",
      template: "client_registration",
    });
    expect(repository.deliveries[0]?.variables.registrationUrl).toContain(
      encodeURIComponent(tokens.raw),
    );
    expect(audit.events[0]?.action).toBe("client.registration.invited");
  });

  it("conclui o cadastro uma única vez", async () => {
    await service.issue(admin, repository.client);

    await expect(
      service.complete(tokens.raw, {
        fullName: "Cliente Completo",
        cpf: "529.982.247-25",
        phone: "(11) 99999-8888",
      }),
    ).resolves.toMatchObject({
      fullName: "Cliente Completo",
      cpf: "52998224725",
    });

    await expect(
      service.complete(tokens.raw, { fullName: "Repetição" }),
    ).rejects.toThrow(RegistrationInvitationError);
  });

  it("recusa link expirado com mensagem genérica", async () => {
    await service.issue(admin, repository.client, 1);
    currentTime = new Date("2026-07-24T13:00:00.000Z");

    await expect(
      service.complete(tokens.raw, { fullName: "Cadastro Tardio" }),
    ).rejects.toThrow("Link inválido, expirado ou já utilizado.");
  });

  it("recusa perfil sem permissão e número inválido", async () => {
    await expect(
      service.issue({ ...admin, role: "client" }, repository.client),
    ).rejects.toThrow(RegistrationInvitationPermissionError);

    await expect(
      service.issue(admin, { ...repository.client, phone: "123" }),
    ).rejects.toThrow("WhatsApp brasileiro válido");
  });
});
