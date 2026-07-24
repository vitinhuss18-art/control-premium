import { assertTenantAccess, hasPermission } from "@control-premium/domain";
import type {
  PixCharge,
  PixProvider,
  PixWebhookDecoder,
  VerifiedPixWebhook,
} from "@control-premium/integrations";

import type {
  ProposalActorContext,
  ProposalAuditWriter,
} from "./proposals";

export type PixChargeRecord = Readonly<{
  id: string;
  tenantId: string;
  loanId: string;
  installmentId: string;
  idempotencyKey: string;
  providerChargeId: string;
  amountCents: number;
  status: "pending" | "paid" | "expired" | "refunded" | "failed";
  copyAndPasteCode: string;
  qrCodeText?: string;
  expiresAt: string;
  createdAt: string;
  paidAt?: string;
  endToEndId?: string;
  refundId?: string;
}>;

export interface PixChargeRepository {
  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<PixChargeRecord | null>;
  findByProviderChargeId(
    providerChargeId: string,
  ): Promise<PixChargeRecord | null>;
  create(record: PixChargeRecord): Promise<PixChargeRecord>;
  applyVerifiedEvent(
    record: PixChargeRecord,
    event: VerifiedPixWebhook,
  ): Promise<{ record: PixChargeRecord; duplicate: boolean }>;
  markRefund(
    tenantId: string,
    chargeId: string,
    input: { refundId: string; status: "pending" | "confirmed" },
  ): Promise<PixChargeRecord>;
}

export interface PixPaymentRecorder {
  record(input: {
    tenantId: string;
    loanId: string;
    installmentId: string;
    amountCents: number;
    paidAt: string;
    idempotencyKey: string;
    providerReference: string;
  }): Promise<void>;
}

export class PixPermissionError extends Error {
  constructor() {
    super("O usuário não possui permissão para esta operação PIX.");
    this.name = "PixPermissionError";
  }
}

export class PixStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PixStateError";
  }
}

function normalizeKey(value: string): string {
  const key = value.trim();
  if (key.length < 8 || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new PixStateError("Chave de idempotência PIX inválida.");
  }
  return key;
}

function validateCharge(
  charge: PixCharge,
  expectedAmountCents: number,
): void {
  if (
    !charge.providerChargeId ||
    charge.amountCents !== expectedAmountCents ||
    !charge.copyAndPasteCode ||
    Number.isNaN(Date.parse(charge.expiresAt))
  ) {
    throw new PixStateError("O provedor retornou uma cobrança PIX inválida.");
  }
}

export class PixService {
  private readonly repository: PixChargeRepository;
  private readonly provider: PixProvider;
  private readonly decoder: PixWebhookDecoder;
  private readonly payments: PixPaymentRecorder;
  private readonly audit: ProposalAuditWriter;
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    repository: PixChargeRepository,
    provider: PixProvider,
    decoder: PixWebhookDecoder,
    payments: PixPaymentRecorder,
    audit: ProposalAuditWriter,
    createId: () => string,
    now: () => Date = () => new Date(),
  ) {
    this.repository = repository;
    this.provider = provider;
    this.decoder = decoder;
    this.payments = payments;
    this.audit = audit;
    this.createId = createId;
    this.now = now;
  }

  async createInstallmentCharge(
    context: ProposalActorContext,
    input: {
      loanId: string;
      installmentId: string;
      amountCents: number;
      expiresAt: string;
      payerReference: string;
      idempotencyKey: string;
    },
  ): Promise<PixChargeRecord> {
    this.require(context, "write");
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new PixStateError("Valor PIX inválido.");
    }
    const expiresAt = new Date(input.expiresAt);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= this.now().getTime()
    ) {
      throw new PixStateError("A validade da cobrança PIX deve ser futura.");
    }
    const key = normalizeKey(input.idempotencyKey);
    const existing = await this.repository.findByIdempotencyKey(
      context.tenantId,
      key,
    );
    if (existing) return existing;

    const providerCharge = await this.provider.createCharge({
      idempotencyKey: key,
      amountCents: input.amountCents,
      expiresAt: expiresAt.toISOString(),
      payerReference: input.payerReference,
    });
    validateCharge(providerCharge, input.amountCents);
    const record = await this.repository.create({
      id: this.createId(),
      tenantId: context.tenantId,
      loanId: input.loanId,
      installmentId: input.installmentId,
      idempotencyKey: key,
      providerChargeId: providerCharge.providerChargeId,
      amountCents: providerCharge.amountCents,
      status: providerCharge.status,
      copyAndPasteCode: providerCharge.copyAndPasteCode,
      ...(providerCharge.qrCodeText
        ? { qrCodeText: providerCharge.qrCodeText }
        : {}),
      expiresAt: providerCharge.expiresAt,
      createdAt: this.now().toISOString(),
    });
    await this.writeAudit(
      context.tenantId,
      context.userId,
      record.id,
      "pix.charge.created",
      { amountCents: record.amountCents },
    );
    return record;
  }

  async handleWebhook(
    headers: Headers,
    rawBody: string,
  ): Promise<{ status: "accepted"; duplicate: boolean }> {
    if (!(await this.provider.verifyWebhook(headers, rawBody))) {
      throw new PixStateError("Assinatura do webhook PIX inválida.");
    }
    const event = this.decoder.decode(rawBody);
    const record = await this.repository.findByProviderChargeId(
      event.providerChargeId,
    );
    if (!record) {
      throw new PixStateError("Cobrança PIX não encontrada.");
    }
    if (
      event.amountCents !== record.amountCents ||
      Number.isNaN(Date.parse(event.occurredAt))
    ) {
      throw new PixStateError("Evento PIX divergente da cobrança.");
    }

    const applied = await this.repository.applyVerifiedEvent(record, event);
    if (event.status === "paid") {
      await this.payments.record({
        tenantId: record.tenantId,
        loanId: record.loanId,
        installmentId: record.installmentId,
        amountCents: event.amountCents,
        paidAt: event.occurredAt,
        idempotencyKey: "pix:" + event.eventId,
        providerReference: event.endToEndId ?? event.providerChargeId,
      });
    }
    await this.writeAudit(
      record.tenantId,
      "pix-webhook",
      record.id,
      "pix.webhook." + event.status,
      { eventId: event.eventId, duplicate: applied.duplicate },
    );
    return { status: "accepted", duplicate: applied.duplicate };
  }

  async refund(
    context: ProposalActorContext,
    charge: PixChargeRecord,
    input: { amountCents: number; idempotencyKey: string },
  ): Promise<PixChargeRecord> {
    this.require(context, "reverse");
    assertTenantAccess(context.tenantId, charge.tenantId);
    if (charge.status !== "paid" || input.amountCents !== charge.amountCents) {
      throw new PixStateError(
        "A devolução integral exige uma cobrança PIX paga.",
      );
    }
    const refund = await this.provider.refundCharge({
      providerChargeId: charge.providerChargeId,
      amountCents: input.amountCents,
      idempotencyKey: normalizeKey(input.idempotencyKey),
    });
    const updated = await this.repository.markRefund(
      context.tenantId,
      charge.id,
      {
        refundId: refund.providerRefundId,
        status: refund.status,
      },
    );
    await this.writeAudit(
      context.tenantId,
      context.userId,
      charge.id,
      "pix.refund.requested",
      { refundId: refund.providerRefundId },
    );
    return updated;
  }

  private require(
    context: ProposalActorContext,
    action: "write" | "reverse",
  ): void {
    const permission =
      action === "write" ? "finance.write" : "finance.reverse";
    if (!hasPermission(context.role, permission)) {
      throw new PixPermissionError();
    }
  }

  private async writeAudit(
    tenantId: string,
    actorId: string,
    entityId: string,
    action: string,
    details: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.audit.write({
      tenantId,
      actorId,
      action,
      entityType: "pix_charge",
      entityId,
      details,
    });
  }
}
