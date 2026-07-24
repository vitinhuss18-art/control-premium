import {
  assertFeatureAccess,
  assertPlanLimit,
  hasPermission,
  validatePlan,
  type SaaSFeature,
  type SaaSPlan,
  type TenantSubscription,
} from "@control-premium/domain";

import type {
  ProposalActorContext,
  ProposalAuditWriter,
} from "./proposals";

export type BillingEvent = Readonly<{
  id: string;
  tenantId: string;
  providerSubscriptionId: string;
  type:
    | "subscription.active"
    | "subscription.past_due"
    | "subscription.canceled";
  planId: string;
  currentPeriodEnd: string;
  occurredAt: string;
}>;

export interface BillingProvider {
  createCheckout(input: {
    tenantId: string;
    planId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string }>;
  createPortal(input: {
    tenantId: string;
    returnUrl: string;
  }): Promise<{ portalUrl: string }>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
}

export interface BillingEventDecoder {
  decode(rawBody: string): BillingEvent;
}

export interface SubscriptionRepository {
  findByTenant(tenantId: string): Promise<TenantSubscription | null>;
  applyEvent(
    event: BillingEvent,
    subscription: TenantSubscription,
  ): Promise<{ subscription: TenantSubscription; duplicate: boolean }>;
}

export class SubscriptionServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionServiceError";
  }
}

export class SubscriptionService {
  private readonly plans: ReadonlyMap<string, SaaSPlan>;
  private readonly subscriptions: SubscriptionRepository;
  private readonly provider: BillingProvider;
  private readonly decoder: BillingEventDecoder;
  private readonly audit: ProposalAuditWriter;
  private readonly now: () => Date;

  constructor(
    plans: readonly SaaSPlan[],
    subscriptions: SubscriptionRepository,
    provider: BillingProvider,
    decoder: BillingEventDecoder,
    audit: ProposalAuditWriter,
    now: () => Date = () => new Date(),
  ) {
    this.plans = new Map(plans.map((plan) => [plan.id, validatePlan(plan)]));
    this.subscriptions = subscriptions;
    this.provider = provider;
    this.decoder = decoder;
    this.audit = audit;
    this.now = now;
  }

  async createCheckout(
    context: ProposalActorContext,
    planId: string,
    urls: { successUrl: string; cancelUrl: string },
  ): Promise<string> {
    if (!hasPermission(context.role, "tenant.manage")) {
      throw new SubscriptionServiceError(
        "Somente administradores podem alterar o plano.",
      );
    }
    if (!this.plans.has(planId)) {
      throw new SubscriptionServiceError("Plano não encontrado.");
    }
    for (const url of [urls.successUrl, urls.cancelUrl]) {
      if (!url.startsWith("https://")) {
        throw new SubscriptionServiceError(
          "Os retornos da assinatura devem utilizar HTTPS.",
        );
      }
    }
    const checkout = await this.provider.createCheckout({
      tenantId: context.tenantId,
      planId,
      ...urls,
    });
    if (!checkout.checkoutUrl.startsWith("https://")) {
      throw new SubscriptionServiceError(
        "O provedor retornou um checkout inválido.",
      );
    }
    return checkout.checkoutUrl;
  }

  async handleWebhook(
    headers: Headers,
    rawBody: string,
  ): Promise<{ duplicate: boolean }> {
    if (!(await this.provider.verifyWebhook(headers, rawBody))) {
      throw new SubscriptionServiceError(
        "Assinatura do webhook de cobrança inválida.",
      );
    }
    const event = this.decoder.decode(rawBody);
    if (
      !this.plans.has(event.planId) ||
      Number.isNaN(Date.parse(event.currentPeriodEnd)) ||
      Number.isNaN(Date.parse(event.occurredAt))
    ) {
      throw new SubscriptionServiceError("Evento de assinatura inválido.");
    }
    const status =
      event.type === "subscription.active"
        ? "active"
        : event.type === "subscription.past_due"
          ? "past_due"
          : "cancelled";
    const subscription: TenantSubscription = {
      tenantId: event.tenantId,
      planId: event.planId,
      status,
      currentPeriodEnd: new Date(event.currentPeriodEnd).toISOString(),
      ...(status === "past_due"
        ? {
            graceUntil: new Date(
              new Date(event.occurredAt).getTime() + 7 * 86_400_000,
            ).toISOString(),
          }
        : {}),
    };
    const result = await this.subscriptions.applyEvent(event, subscription);
    await this.audit.write({
      tenantId: event.tenantId,
      actorId: "billing-webhook",
      action: event.type,
      entityType: "subscription",
      entityId: event.providerSubscriptionId,
      details: { eventId: event.id, duplicate: result.duplicate },
    });
    return { duplicate: result.duplicate };
  }

  async assertAccess(
    tenantId: string,
    feature: SaaSFeature,
    usage?: {
      resource: keyof SaaSPlan["limits"];
      current: number;
      increment?: number;
    },
  ): Promise<void> {
    const subscription = await this.subscriptions.findByTenant(tenantId);
    if (!subscription) {
      throw new SubscriptionServiceError("Assinatura não encontrada.");
    }
    const plan = this.plans.get(subscription.planId);
    if (!plan) throw new SubscriptionServiceError("Plano não encontrado.");
    assertFeatureAccess(subscription, plan, feature, this.now());
    if (usage) {
      assertPlanLimit(
        plan,
        usage.resource,
        usage.current,
        usage.increment ?? 1,
      );
    }
  }
}
