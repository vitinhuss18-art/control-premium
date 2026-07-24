export type SaaSFeature =
  | "clients"
  | "users"
  | "whatsapp_messages"
  | "storage_bytes"
  | "ai_assistance"
  | "reports";

export type SaaSPlan = Readonly<{
  id: string;
  name: string;
  monthlyPriceCents: number;
  limits: Readonly<Record<Exclude<SaaSFeature, "ai_assistance" | "reports">, number>>;
  features: readonly SaaSFeature[];
}>;

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled";

export type TenantSubscription = Readonly<{
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  graceUntil?: string;
}>;

export class SubscriptionAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionAccessError";
  }
}

export function validatePlan(plan: SaaSPlan): SaaSPlan {
  if (
    !plan.id.trim() ||
    !plan.name.trim() ||
    !Number.isSafeInteger(plan.monthlyPriceCents) ||
    plan.monthlyPriceCents < 0
  ) {
    throw new SubscriptionAccessError("Plano SaaS inválido.");
  }
  for (const [limit, value] of Object.entries(plan.limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new SubscriptionAccessError(
        "Limite inválido no plano: " + limit + ".",
      );
    }
  }
  return Object.freeze({
    ...plan,
    limits: Object.freeze({ ...plan.limits }),
    features: Object.freeze([...new Set(plan.features)]),
  });
}

export function hasSubscriptionAccess(
  subscription: TenantSubscription,
  at: Date,
): boolean {
  if (
    subscription.status === "active" ||
    subscription.status === "trialing"
  ) {
    return true;
  }
  return (
    subscription.status === "past_due" &&
    Boolean(
      subscription.graceUntil &&
        new Date(subscription.graceUntil).getTime() > at.getTime(),
    )
  );
}

export function assertFeatureAccess(
  subscription: TenantSubscription,
  plan: SaaSPlan,
  feature: SaaSFeature,
  at: Date,
): void {
  if (!hasSubscriptionAccess(subscription, at)) {
    throw new SubscriptionAccessError(
      "A assinatura não está ativa para novos lançamentos.",
    );
  }
  if (!plan.features.includes(feature)) {
    throw new SubscriptionAccessError(
      "O recurso não está incluído no plano contratado.",
    );
  }
}

export function assertPlanLimit(
  plan: SaaSPlan,
  resource: keyof SaaSPlan["limits"],
  currentUsage: number,
  increment = 1,
): void {
  if (
    !Number.isSafeInteger(currentUsage) ||
    currentUsage < 0 ||
    !Number.isSafeInteger(increment) ||
    increment < 0
  ) {
    throw new SubscriptionAccessError("Consumo do plano inválido.");
  }
  if (currentUsage + increment > plan.limits[resource]) {
    throw new SubscriptionAccessError(
      "O limite de " + resource + " do plano foi atingido.",
    );
  }
}
