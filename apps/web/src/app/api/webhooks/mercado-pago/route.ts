import { createHash } from "node:crypto";

import { createBillingServiceClient } from "@/lib/billingServer";
import {
  getMercadoPagoAuthorizedPayment,
  mercadoPagoPaymentClient,
  mercadoPagoSubscriptionClient,
  validateMercadoPagoWebhook,
} from "@/lib/mercadoPago";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function nestedText(value: unknown, ...keys: string[]): string | null {
  let current: unknown = value;
  for (const key of keys) {
    const currentRecord = record(current);
    if (!currentRecord) return null;
    current = currentRecord[key];
  }
  return text(current);
}

function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function webhookKind(
  rawType: string,
): "payment" | "authorized_payment" | "subscription" | null {
  const normalized = rawType.toLowerCase();
  if (normalized === "payment" || normalized.startsWith("payment.")) {
    return "payment";
  }
  if (
    normalized === "subscription_authorized_payment" ||
    normalized.startsWith("subscription_authorized_payment.")
  ) {
    return "authorized_payment";
  }
  if (
    normalized === "subscription_preapproval" ||
    normalized === "preapproval" ||
    normalized.startsWith("subscription_preapproval.")
  ) {
    return "subscription";
  }
  return null;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => null)) as unknown;
  const bodyRecord = record(body);
  const rawType =
    url.searchParams.get("type") ??
    text(bodyRecord?.type) ??
    text(bodyRecord?.action) ??
    "";
  const kind = webhookKind(rawType);
  const dataId =
    url.searchParams.get("data.id") ??
    nestedText(bodyRecord?.data, "id") ??
    text(bodyRecord?.id);

  // Tópicos que não pertencem à cobrança do SaaS são reconhecidos sem erro,
  // evitando novas tentativas desnecessárias do provedor.
  if (!kind || !dataId) {
    return Response.json({ received: true, processed: false });
  }

  const xSignature = request.headers.get("x-signature");
  let signatureValid = false;
  try {
    if (xSignature) {
      validateMercadoPagoWebhook({
        xSignature,
        xRequestId: request.headers.get("x-request-id"),
        dataId,
      });
      signatureValid = true;
    } else if (kind !== "payment") {
      // O SDK oficial documenta que algumas notificações de QR/PIX podem vir
      // sem assinatura. Somente esse tipo segue adiante, e ainda assim o status
      // será lido diretamente da API do Mercado Pago e conferido com a fatura.
      return Response.json(
        { message: "Assinatura do webhook ausente." },
        { status: 401 },
      );
    }
  } catch {
    return Response.json(
      { message: "Assinatura do webhook inválida." },
      { status: 401 },
    );
  }

  try {
    const service = createBillingServiceClient();

    if (kind === "subscription") {
      const subscription = await mercadoPagoSubscriptionClient().get({
        id: dataId,
      });
      const externalReference = subscription.external_reference ?? "";
      if (!externalReference.startsWith("cp_saas_")) {
        return Response.json({ received: true, processed: false });
      }

      const { error } = await service.rpc("process_mercado_pago_subscription", {
        p_provider_subscription_id: subscription.id ?? dataId,
        p_external_reference: externalReference,
        p_provider_status: subscription.status ?? "pending",
        p_payload_hash: payloadHash(subscription),
        p_signature_valid: signatureValid,
      });
      if (error) throw error;
      return Response.json({ received: true, processed: true });
    }

    const authorizedPayment =
      kind === "authorized_payment"
        ? await getMercadoPagoAuthorizedPayment(dataId)
        : null;
    const providerPaymentId = authorizedPayment?.payment?.id
      ? String(authorizedPayment.payment.id)
      : dataId;
    const payment = await mercadoPagoPaymentClient().get({
      id: providerPaymentId,
    });
    const externalReference =
      payment.external_reference ??
      text(authorizedPayment?.external_reference) ??
      "";
    const providerSubscriptionId =
      authorizedPayment?.preapproval_id ??
      nestedText(payment.metadata, "preapproval_id") ??
      nestedText(
        payment.point_of_interaction,
        "transaction_data",
        "subscription_id",
      );

    let belongsToControlPremium = externalReference.startsWith("cp_saas_");
    if (!belongsToControlPremium && providerSubscriptionId) {
      const { data: matchingInvoice } = await service
        .from("saas_billing_invoices")
        .select("id")
        .eq("provider", "mercado_pago")
        .eq("provider_subscription_id", providerSubscriptionId)
        .limit(1)
        .maybeSingle();
      belongsToControlPremium = Boolean(matchingInvoice);
    }
    if (!belongsToControlPremium) {
      return Response.json({ received: true, processed: false });
    }

    const status = payment.status ?? "pending";
    const supported = new Set([
      "approved",
      "authorized",
      "pending",
      "in_process",
      "rejected",
      "cancelled",
      "refunded",
      "charged_back",
    ]);
    if (!supported.has(status)) {
      return Response.json({ received: true, processed: false });
    }

    const amount = Number(payment.transaction_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Pagamento sem valor válido");
    }

    const { error } = await service.rpc("process_mercado_pago_payment", {
      p_provider_payment_id: String(payment.id ?? providerPaymentId),
      p_external_reference: externalReference,
      p_provider_subscription_id: providerSubscriptionId,
      p_provider_status: status,
      p_status_detail: payment.status_detail ?? null,
      p_amount_cents: Math.round(amount * 100),
      p_currency: payment.currency_id ?? "BRL",
      p_payment_method: payment.payment_method_id === "pix" ? "pix" : "card",
      p_paid_at: payment.date_approved ?? null,
      p_payload_hash: payloadHash(payment),
      p_signature_valid: signatureValid,
    });
    if (error) throw error;

    return Response.json({ received: true, processed: true });
  } catch (error) {
    console.error("Falha ao processar webhook do Mercado Pago", error);
    return Response.json(
      { message: "Falha temporária ao processar notificação." },
      { status: 500 },
    );
  }
}
