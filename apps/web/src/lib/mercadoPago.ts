import MercadoPagoConfig, {
  Payment,
  PreApproval,
  WebhookSignatureValidator,
} from "mercadopago";

import { BillingRequestError } from "./billingServer";

function accessToken(): string {
  const token =
    process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim() ||
    process.env.BILLING_API_KEY?.trim();
  if (!token) {
    throw new BillingRequestError(
      "Mercado Pago ainda não foi ativado na hospedagem.",
      503,
    );
  }
  return token;
}

function config(): MercadoPagoConfig {
  return new MercadoPagoConfig({
    accessToken: accessToken(),
    options: {
      timeout: 12_000,
      maxRetries: 2,
      initialDelay: 250,
      jitter: true,
    },
  });
}

export function mercadoPagoPaymentClient(): Payment {
  return new Payment(config());
}

export function mercadoPagoSubscriptionClient(): PreApproval {
  return new PreApproval(config());
}

export type MercadoPagoAuthorizedPayment = Readonly<{
  id?: number;
  preapproval_id?: string;
  external_reference?: string | number;
  currency_id?: string;
  transaction_amount?: string | number;
  status?: string;
  summarized?: string;
  debit_date?: string;
  payment?: Readonly<{
    id?: number;
    status?: string;
    status_detail?: string;
  }>;
}>;

export async function getMercadoPagoAuthorizedPayment(
  id: string,
): Promise<MercadoPagoAuthorizedPayment> {
  const response = await fetch(
    `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(id)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Mercado Pago retornou HTTP ${response.status}`);
  }
  return (await response.json()) as MercadoPagoAuthorizedPayment;
}

export function validateMercadoPagoWebhook(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
}): void {
  const secret =
    process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ||
    process.env.BILLING_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new BillingRequestError(
      "Assinatura dos webhooks do Mercado Pago não configurada.",
      503,
    );
  }
  WebhookSignatureValidator.validate({
    xSignature: input.xSignature,
    xRequestId: input.xRequestId,
    dataId: input.dataId,
    secret,
    toleranceSeconds: 300,
  });
}
