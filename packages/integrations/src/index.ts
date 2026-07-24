export type PixChargeStatus =
  "pending" | "paid" | "expired" | "refunded" | "failed";

export type PixCharge = Readonly<{
  providerChargeId: string;
  amountCents: number;
  status: PixChargeStatus;
  copyAndPasteCode: string;
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
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
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
