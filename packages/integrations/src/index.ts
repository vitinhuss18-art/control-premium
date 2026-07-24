export type PixChargeStatus =
  "pending" | "paid" | "expired" | "refunded" | "failed";

export type PixCharge = Readonly<{
  providerChargeId: string;
  amountCents: number;
  status: PixChargeStatus;
  copyAndPasteCode: string;
  qrCodeText?: string;
  expiresAt: string;
}>;

export interface PixProvider {
  createCharge(input: {
    idempotencyKey: string;
    amountCents: number;
    expiresAt: string;
    payerReference: string;
  }): Promise<PixCharge>;
  getCharge(providerChargeId: string): Promise<PixCharge>;
  refundCharge(input: {
    providerChargeId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ providerRefundId: string; status: "pending" | "confirmed" }>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
}

export type VerifiedPixWebhook = Readonly<{
  providerChargeId: string;
  eventId: string;
  endToEndId?: string;
  status: PixChargeStatus;
  amountCents: number;
  occurredAt: string;
}>;

export interface PixWebhookDecoder {
  decode(rawBody: string): VerifiedPixWebhook;
}

export type MessageStatus = "queued" | "sent" | "delivered" | "failed";

export interface WhatsAppProvider {
  sendTemplate(input: {
    idempotencyKey: string;
    recipient: string;
    templateName: string;
    variables: Readonly<Record<string, string>>;
  }): Promise<{ providerMessageId: string; status: MessageStatus }>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
}
