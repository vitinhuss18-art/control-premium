import { hasPermission } from "@control-premium/domain";
import type { WhatsAppProvider } from "@control-premium/integrations";

import type {
  ProposalActorContext,
  ProposalAuditWriter,
} from "./proposals";

export type MessageCategory =
  | "registration"
  | "pre_due"
  | "due"
  | "overdue"
  | "payment"
  | "settlement"
  | "renegotiation";

export type MessageRecord = Readonly<{
  id: string;
  tenantId: string;
  idempotencyKey: string;
  recipient: string;
  category: MessageCategory;
  templateName: string;
  variables: Readonly<Record<string, string>>;
  status: "queued" | "sent" | "delivered" | "failed" | "cancelled";
  scheduledAt: string;
  attempts: number;
  providerMessageId?: string;
  lastError?: string;
  createdAt: string;
}>;

export type MessagingWindowPolicy = Readonly<{
  utcOffsetMinutes: number;
  startMinute: number;
  endMinute: number;
  allowedWeekdays: readonly number[];
  holidays: readonly string[];
  maxAttempts: number;
}>;

export interface MessageRepository {
  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<MessageRecord | null>;
  create(record: MessageRecord): Promise<MessageRecord>;
  update(
    tenantId: string,
    messageId: string,
    changes: Partial<MessageRecord>,
  ): Promise<MessageRecord>;
}

export interface MessagingConsentReader {
  canSend(input: {
    tenantId: string;
    recipient: string;
    category: MessageCategory;
  }): Promise<boolean>;
}

export interface MessagingQuota {
  reserve(tenantId: string): Promise<boolean>;
}

export class MessagingPermissionError extends Error {
  constructor() {
    super("O usuário não possui permissão para enviar cobranças.");
    this.name = "MessagingPermissionError";
  }
}

export class MessagingPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagingPolicyError";
  }
}

function normalizeKey(value: string): string {
  const key = value.trim();
  if (key.length < 8 || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new MessagingPolicyError("Chave de idempotência inválida.");
  }
  return key;
}

function normalizeRecipient(value: string): string {
  const recipient = value.replace(/[^\d+]/g, "");
  if (!/^\+\d{10,15}$/.test(recipient)) {
    throw new MessagingPolicyError(
      "O destinatário deve estar no formato internacional.",
    );
  }
  return recipient;
}

function localParts(instant: Date, offsetMinutes: number) {
  const shifted = new Date(instant.getTime() + offsetMinutes * 60_000);
  return {
    shifted,
    date: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function localToUtc(
  localDate: Date,
  minute: number,
  offsetMinutes: number,
): Date {
  const value = new Date(localDate);
  value.setUTCHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return new Date(value.getTime() - offsetMinutes * 60_000);
}

export function nextAllowedMessageTime(
  requestedAt: Date,
  policy: MessagingWindowPolicy,
): Date {
  if (
    !Number.isInteger(policy.utcOffsetMinutes) ||
    !Number.isInteger(policy.startMinute) ||
    !Number.isInteger(policy.endMinute) ||
    policy.startMinute < 0 ||
    policy.endMinute > 1_440 ||
    policy.startMinute >= policy.endMinute ||
    policy.allowedWeekdays.length === 0
  ) {
    throw new MessagingPolicyError("Janela de mensagens inválida.");
  }
  const holidaySet = new Set(policy.holidays);
  let candidate = new Date(requestedAt);

  for (let dayOffset = 0; dayOffset <= 370; dayOffset += 1) {
    const parts = localParts(candidate, policy.utcOffsetMinutes);
    const allowedDay =
      policy.allowedWeekdays.includes(parts.weekday) &&
      !holidaySet.has(parts.date);

    if (allowedDay && parts.minute < policy.startMinute) {
      return localToUtc(
        parts.shifted,
        policy.startMinute,
        policy.utcOffsetMinutes,
      );
    }
    if (
      allowedDay &&
      parts.minute >= policy.startMinute &&
      parts.minute < policy.endMinute
    ) {
      return candidate;
    }

    const nextLocal = new Date(parts.shifted);
    nextLocal.setUTCDate(nextLocal.getUTCDate() + 1);
    candidate = localToUtc(
      nextLocal,
      policy.startMinute,
      policy.utcOffsetMinutes,
    );
  }
  throw new MessagingPolicyError(
    "Não foi possível encontrar uma janela de envio.",
  );
}

export class MessagingService {
  private readonly repository: MessageRepository;
  private readonly provider: WhatsAppProvider;
  private readonly consent: MessagingConsentReader;
  private readonly quota: MessagingQuota;
  private readonly audit: ProposalAuditWriter;
  private readonly policy: MessagingWindowPolicy;
  private readonly approvedTemplates: Readonly<
    Record<MessageCategory, readonly string[]>
  >;
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    repository: MessageRepository,
    provider: WhatsAppProvider,
    consent: MessagingConsentReader,
    quota: MessagingQuota,
    audit: ProposalAuditWriter,
    policy: MessagingWindowPolicy,
    approvedTemplates: Readonly<
      Record<MessageCategory, readonly string[]>
    >,
    createId: () => string,
    now: () => Date = () => new Date(),
  ) {
    this.repository = repository;
    this.provider = provider;
    this.consent = consent;
    this.quota = quota;
    this.audit = audit;
    this.policy = policy;
    this.approvedTemplates = approvedTemplates;
    this.createId = createId;
    this.now = now;
  }

  async queueTemplate(
    context: ProposalActorContext,
    input: {
      idempotencyKey: string;
      recipient: string;
      category: MessageCategory;
      templateName: string;
      variables: Readonly<Record<string, string>>;
      requestedAt?: string;
    },
  ): Promise<MessageRecord> {
    if (!hasPermission(context.role, "collections.manage")) {
      throw new MessagingPermissionError();
    }
    const key = normalizeKey(input.idempotencyKey);
    const existing = await this.repository.findByIdempotencyKey(
      context.tenantId,
      key,
    );
    if (existing) return existing;

    const recipient = normalizeRecipient(input.recipient);
    if (
      !this.approvedTemplates[input.category]?.includes(input.templateName)
    ) {
      throw new MessagingPolicyError(
        "Use somente um template oficial aprovado para esta finalidade.",
      );
    }
    if (
      !(await this.consent.canSend({
        tenantId: context.tenantId,
        recipient,
        category: input.category,
      }))
    ) {
      throw new MessagingPolicyError(
        "O destinatário não possui consentimento válido ou solicitou opt-out.",
      );
    }
    if (!(await this.quota.reserve(context.tenantId))) {
      throw new MessagingPolicyError(
        "O limite de mensagens do plano foi atingido.",
      );
    }

    const requestedAt = input.requestedAt
      ? new Date(input.requestedAt)
      : this.now();
    if (Number.isNaN(requestedAt.getTime())) {
      throw new MessagingPolicyError("Horário solicitado inválido.");
    }
    const scheduledAt = nextAllowedMessageTime(requestedAt, this.policy);
    const record = await this.repository.create({
      id: this.createId(),
      tenantId: context.tenantId,
      idempotencyKey: key,
      recipient,
      category: input.category,
      templateName: input.templateName,
      variables: Object.freeze({ ...input.variables }),
      status: "queued",
      scheduledAt: scheduledAt.toISOString(),
      attempts: 0,
      createdAt: this.now().toISOString(),
    });
    await this.writeAudit(context, record, "message.queued");
    return record;
  }

  async dispatch(record: MessageRecord): Promise<MessageRecord> {
    if (
      record.status !== "queued" &&
      !(record.status === "failed" && record.attempts < this.policy.maxAttempts)
    ) {
      return record;
    }
    if (new Date(record.scheduledAt).getTime() > this.now().getTime()) {
      return record;
    }

    try {
      const sent = await this.provider.sendTemplate({
        idempotencyKey: record.idempotencyKey,
        recipient: record.recipient,
        templateName: record.templateName,
        variables: record.variables,
      });
      const updated = await this.repository.update(
        record.tenantId,
        record.id,
        {
          status: sent.status === "failed" ? "failed" : "sent",
          providerMessageId: sent.providerMessageId,
          attempts: record.attempts + 1,
        },
      );
      await this.writeAudit(
        {
          tenantId: record.tenantId,
          userId: "message-worker",
          role: "super_admin",
        },
        updated,
        "message." + updated.status,
      );
      return updated;
    } catch (error) {
      return this.repository.update(record.tenantId, record.id, {
        status: "failed",
        attempts: record.attempts + 1,
        lastError: error instanceof Error ? error.name : "ProviderError",
      });
    }
  }

  private async writeAudit(
    context: Pick<ProposalActorContext, "tenantId" | "userId">,
    record: MessageRecord,
    action: string,
  ): Promise<void> {
    await this.audit.write({
      tenantId: context.tenantId,
      actorId: context.userId,
      action,
      entityType: "message",
      entityId: record.id,
      details: {
        category: record.category,
        recipient: record.recipient.slice(0, -4) + "****",
        status: record.status,
      },
    });
  }
}
