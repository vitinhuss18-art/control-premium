import {
  hasPermission,
  normalizeClientDraft,
  type ClientDraft,
} from "@control-premium/domain";

import type { AuditWriter, ClientRecord, UserContext } from "./clients";

export type RegistrationInvitation = Readonly<{
  id: string;
  tenantId: string;
  clientId: string;
  recipient: string;
  tokenHash: string;
  status: "pending" | "consumed" | "revoked";
  expiresAt: string;
  createdAt: string;
  createdBy: string;
}>;

export type RegistrationDelivery = Readonly<{
  tenantId: string;
  invitationId: string;
  channel: "whatsapp";
  recipient: string;
  template: "client_registration";
  variables: Readonly<{
    registrationUrl: string;
    expiresAt: string;
  }>;
}>;

export interface RegistrationInvitationRepository {
  createWithDelivery(
    invitation: RegistrationInvitation,
    delivery: RegistrationDelivery,
  ): Promise<void>;
  findPendingByTokenHash(
    tokenHash: string,
  ): Promise<RegistrationInvitation | null>;
  consumeAndUpdateClient(input: {
    invitationId: string;
    tokenHash: string;
    tenantId: string;
    clientId: string;
    completedAt: string;
    client: ReturnType<typeof normalizeClientDraft>;
  }): Promise<ClientRecord | null>;
}

export interface RegistrationTokenCodec {
  generate(): string;
  hash(token: string): Promise<string>;
}

export class RegistrationInvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrationInvitationError";
  }
}

export class RegistrationInvitationPermissionError extends Error {
  constructor() {
    super("O usuário não possui permissão para gerar o cadastro por link.");
    this.name = "RegistrationInvitationPermissionError";
  }
}

export class RegistrationInvitationService {
  constructor(
    private readonly invitations: RegistrationInvitationRepository,
    private readonly tokens: RegistrationTokenCodec,
    private readonly audit: AuditWriter,
    private readonly createId: () => string,
    private readonly registrationBaseUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!registrationBaseUrl.startsWith("https://")) {
      throw new RegistrationInvitationError(
        "O endereço de cadastro deve utilizar HTTPS.",
      );
    }
  }

  async issue(
    context: UserContext,
    client: ClientRecord,
    ttlHours = 24,
  ): Promise<{ invitationId: string; expiresAt: string }> {
    if (!hasPermission(context.role, "clients.write")) {
      throw new RegistrationInvitationPermissionError();
    }

    if (client.tenantId !== context.tenantId) {
      throw new RegistrationInvitationError("Cliente não encontrado.");
    }

    if (!Number.isInteger(ttlHours) || ttlHours < 1 || ttlHours > 72) {
      throw new RegistrationInvitationError(
        "A validade do link deve ficar entre 1 e 72 horas.",
      );
    }

    const recipient = normalizeWhatsappNumber(client.phone);
    const token = this.tokens.generate();
    if (token.length < 32) {
      throw new RegistrationInvitationError(
        "O gerador de token não atende ao mínimo de segurança.",
      );
    }

    const tokenHash = await this.tokens.hash(token);
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000);
    const invitationId = this.createId();
    const registrationUrl = `${this.registrationBaseUrl}?token=${encodeURIComponent(token)}`;

    await this.invitations.createWithDelivery(
      {
        id: invitationId,
        tenantId: context.tenantId,
        clientId: client.id,
        recipient,
        tokenHash,
        status: "pending",
        expiresAt: expiresAt.toISOString(),
        createdAt: createdAt.toISOString(),
        createdBy: context.userId,
      },
      {
        tenantId: context.tenantId,
        invitationId,
        channel: "whatsapp",
        recipient,
        template: "client_registration",
        variables: {
          registrationUrl,
          expiresAt: expiresAt.toISOString(),
        },
      },
    );

    await this.audit.write({
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "client.registration.invited",
      entityType: "client",
      entityId: client.id,
      details: { invitationId, expiresAt: expiresAt.toISOString() },
    });

    return { invitationId, expiresAt: expiresAt.toISOString() };
  }

  async complete(token: string, input: ClientDraft): Promise<ClientRecord> {
    if (token.length < 32) {
      throw new RegistrationInvitationError(
        "Link inválido, expirado ou já utilizado.",
      );
    }

    const tokenHash = await this.tokens.hash(token);
    const invitation = await this.invitations.findPendingByTokenHash(tokenHash);
    const completedAt = this.now();

    if (
      !invitation ||
      invitation.status !== "pending" ||
      completedAt.getTime() >= new Date(invitation.expiresAt).getTime()
    ) {
      throw new RegistrationInvitationError(
        "Link inválido, expirado ou já utilizado.",
      );
    }

    const client = await this.invitations.consumeAndUpdateClient({
      invitationId: invitation.id,
      tokenHash,
      tenantId: invitation.tenantId,
      clientId: invitation.clientId,
      completedAt: completedAt.toISOString(),
      client: normalizeClientDraft(input),
    });

    if (!client) {
      throw new RegistrationInvitationError(
        "Link inválido, expirado ou já utilizado.",
      );
    }

    await this.audit.write({
      tenantId: invitation.tenantId,
      actorId: `registration:${invitation.id}`,
      action: "client.registration.completed",
      entityType: "client",
      entityId: invitation.clientId,
    });

    return client;
  }
}

export function normalizeWhatsappNumber(phone?: string): string {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const withCountryCode =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;

  if (
    (withCountryCode.length !== 12 && withCountryCode.length !== 13) ||
    !withCountryCode.startsWith("55")
  ) {
    throw new RegistrationInvitationError(
      "O cliente precisa possuir um WhatsApp brasileiro válido.",
    );
  }

  return `+${withCountryCode}`;
}
