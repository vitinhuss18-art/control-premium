import { randomUUID } from "node:crypto";

import {
  billingErrorResponse,
  BillingRequestError,
  getTrustedAppOrigin,
  MERCADO_PAGO_PROVIDER,
  PREMIUM_PLAN_CODE,
  requireSubscriberBillingContext,
} from "@/lib/billingServer";
import {
  mercadoPagoPaymentClient,
  mercadoPagoSubscriptionClient,
} from "@/lib/mercadoPago";

type CheckoutBody = { method?: unknown };
type BillingMethod = "pix" | "card";

function parseMethod(body: CheckoutBody | null): BillingMethod | null {
  return body?.method === "pix" || body?.method === "card" ? body.method : null;
}

export async function POST(request: Request) {
  try {
    const context = await requireSubscriberBillingContext(request);
    const body = (await request
      .json()
      .catch(() => null)) as CheckoutBody | null;
    const method = parseMethod(body);
    if (!method) {
      throw new BillingRequestError("Forma de pagamento inválida.", 400);
    }

    const { data: plan, error: planError } = await context.service
      .from("saas_plans")
      .select("id, code, name, price_cents, currency, billing_interval")
      .eq("code", PREMIUM_PLAN_CODE)
      .eq("active", true)
      .maybeSingle();
    if (planError || !plan || Number(plan.price_cents) !== 4990) {
      throw new BillingRequestError(
        "O Plano Premium não está disponível para cobrança.",
        503,
      );
    }

    if (method === "card") {
      const { data: currentSubscription } = await context.service
        .from("tenant_subscriptions")
        .select("status, provider, provider_subscription_id, plan_id")
        .eq("tenant_id", context.tenantId)
        .maybeSingle();
      if (
        currentSubscription?.status === "active" &&
        currentSubscription.provider === MERCADO_PAGO_PROVIDER &&
        currentSubscription.provider_subscription_id &&
        currentSubscription.plan_id === plan.id
      ) {
        throw new BillingRequestError(
          "A cobrança recorrente no cartão já está ativa para esta empresa.",
          409,
        );
      }
    }

    // Evita gerar várias cobranças se houver clique duplo ou atualização da
    // página. A URL anterior só é reaproveitada por uma janela curta.
    const reuseSince = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: existing } = await context.service
      .from("saas_billing_invoices")
      .select("id, checkout_url, expires_at")
      .eq("tenant_id", context.tenantId)
      .eq("provider", MERCADO_PAGO_PROVIDER)
      .eq("payment_method", method)
      .eq("status", "pending")
      .gte("created_at", reuseSince)
      .not("checkout_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      existing?.checkout_url &&
      (!existing.expires_at ||
        new Date(existing.expires_at).getTime() > Date.now())
    ) {
      return Response.json({
        invoiceId: existing.id,
        checkoutUrl: existing.checkout_url,
        reused: true,
      });
    }

    const invoiceId = randomUUID();
    const idempotencyKey = randomUUID();
    const externalReference = `cp_saas_${invoiceId}`;
    const appOrigin = getTrustedAppOrigin(request);
    const returnUrl = `${appOrigin}/painel?billing=return`;
    const webhookUrl = `${appOrigin}/api/webhooks/mercado-pago`;

    const { error: insertError } = await context.service
      .from("saas_billing_invoices")
      .insert({
        id: invoiceId,
        tenant_id: context.tenantId,
        plan_id: plan.id,
        provider: MERCADO_PAGO_PROVIDER,
        payment_method: method,
        external_reference: externalReference,
        idempotency_key: idempotencyKey,
        amount_cents: Number(plan.price_cents),
        currency: String(plan.currency).trim(),
        status: "creating",
      });
    if (insertError) {
      throw insertError;
    }

    try {
      if (method === "card") {
        const subscription = await mercadoPagoSubscriptionClient().create({
          body: {
            reason: "Control Premium - Plano Premium",
            external_reference: externalReference,
            payer_email: context.email,
            back_url: returnUrl,
            auto_recurring: {
              frequency: 1,
              frequency_type: "months",
              transaction_amount: Number(plan.price_cents) / 100,
              currency_id: String(plan.currency).trim(),
            },
            status: "pending",
          },
          requestOptions: { idempotencyKey },
        });
        if (!subscription.id || !subscription.init_point) {
          throw new Error("Mercado Pago não retornou o checkout da assinatura");
        }

        const { error: updateError } = await context.service
          .from("saas_billing_invoices")
          .update({
            provider_subscription_id: subscription.id,
            checkout_url: subscription.init_point,
            provider_status_detail: subscription.status ?? "pending",
            status: "pending",
          })
          .eq("id", invoiceId)
          .eq("tenant_id", context.tenantId);
        if (updateError) throw updateError;

        return Response.json({
          invoiceId,
          checkoutUrl: subscription.init_point,
          method,
        });
      }

      const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const payment = await mercadoPagoPaymentClient().create({
        body: {
          transaction_amount: Number(plan.price_cents) / 100,
          description: "Control Premium - Plano Premium mensal",
          payment_method_id: "pix",
          external_reference: externalReference,
          notification_url: webhookUrl,
          callback_url: returnUrl,
          date_of_expiration: expiresAt,
          payer: { email: context.email },
          metadata: { billing_invoice_id: invoiceId },
        },
        requestOptions: { idempotencyKey },
      });
      const checkoutUrl =
        payment.point_of_interaction?.transaction_data?.ticket_url;
      if (!payment.id || !checkoutUrl) {
        throw new Error("Mercado Pago não retornou a cobrança PIX");
      }

      const { error: updateError } = await context.service
        .from("saas_billing_invoices")
        .update({
          provider_payment_id: String(payment.id),
          checkout_url: checkoutUrl,
          provider_status_detail: payment.status_detail ?? payment.status,
          status: payment.status === "approved" ? "paid" : "pending",
          expires_at: payment.date_of_expiration ?? expiresAt,
        })
        .eq("id", invoiceId)
        .eq("tenant_id", context.tenantId);
      if (updateError) throw updateError;

      // Em casos raros o PIX pode voltar aprovado imediatamente. Aplicamos a
      // mesma rotina atomica usada pelo webhook, sem confiar no navegador.
      if (payment.status === "approved") {
        const { error: processError } = await context.service.rpc(
          "process_mercado_pago_payment",
          {
            p_provider_payment_id: String(payment.id),
            p_external_reference:
              payment.external_reference ?? externalReference,
            p_provider_subscription_id: null,
            p_provider_status: payment.status,
            p_status_detail: payment.status_detail ?? null,
            p_amount_cents: Math.round(
              Number(payment.transaction_amount) * 100,
            ),
            p_currency: payment.currency_id ?? "BRL",
            p_payment_method: "pix",
            p_paid_at: payment.date_approved ?? new Date().toISOString(),
            p_payload_hash: "0".repeat(64),
            p_signature_valid: true,
          },
        );
        if (processError) throw processError;
      }

      return Response.json({ invoiceId, checkoutUrl, method });
    } catch (providerError) {
      await context.service
        .from("saas_billing_invoices")
        .update({ status: "failed" })
        .eq("id", invoiceId)
        .eq("status", "creating");
      throw providerError;
    }
  } catch (error) {
    return billingErrorResponse(error);
  }
}
