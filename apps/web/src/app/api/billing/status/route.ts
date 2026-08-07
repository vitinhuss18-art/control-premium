import {
  billingErrorResponse,
  requireSubscriberBillingContext,
} from "@/lib/billingServer";

export async function GET(request: Request) {
  try {
    const context = await requireSubscriberBillingContext(request);

    const [
      { data: subscription, error: subscriptionError },
      { data: invoice },
    ] = await Promise.all([
      context.service
        .from("tenant_subscriptions")
        .select(
          "status, current_period_start, current_period_end, trial_ends_at, provider, saas_plans(code, name, price_cents, currency, billing_interval)",
        )
        .eq("tenant_id", context.tenantId)
        .maybeSingle(),
      context.service
        .from("saas_billing_invoices")
        .select(
          "id, payment_method, status, amount_cents, currency, expires_at, paid_at, created_at",
        )
        .eq("tenant_id", context.tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (subscriptionError) throw subscriptionError;

    return Response.json({
      subscription: subscription ?? null,
      latestInvoice: invoice ?? null,
    });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
