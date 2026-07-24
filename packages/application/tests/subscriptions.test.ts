import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";

import type { TenantSubscription } from "@control-premium/domain";

import {
  SubscriptionService,
  SubscriptionServiceError,
  type BillingEvent,
  type BillingEventDecoder,
  type BillingProvider,
  type SubscriptionRepository,
} from "../src/subscriptions";
import type {
  ProposalActorContext,
  ProposalAuditWriter,
} from "../src/proposals";

class FakeBilling implements BillingProvider {
  valid = true;
  async createCheckout() {
    return { checkoutUrl: "https://billing.test/checkout/1" };
  }
  async createPortal() {
    return { portalUrl: "https://billing.test/portal/1" };
  }
  async verifyWebhook() {
    return this.valid;
  }
}

class Decoder implements BillingEventDecoder {
  decode(rawBody: string): BillingEvent {
    return JSON.parse(rawBody) as BillingEvent;
  }
}

class MemorySubscriptions implements SubscriptionRepository {
  subscription: TenantSubscription | null = null;
  events = new Set<string>();
  async findByTenant(tenantId: string) {
    return this.subscription?.tenantId === tenantId ? this.subscription : null;
  }
  async applyEvent(event: BillingEvent, subscription: TenantSubscription) {
    const duplicate = this.events.has(event.id);
    this.events.add(event.id);
    if (!duplicate) this.subscription = subscription;
    return { subscription: this.subscription!, duplicate };
  }
}

class Audit implements ProposalAuditWriter {
  async write() {}
}

const plans = [
  {
    id: "professional",
    name: "Profissional",
    monthlyPriceCents: 19_900,
    limits: {
      clients: 100,
      users: 5,
      whatsapp_messages: 1_000,
      storage_bytes: 1_000_000_000,
    },
    features: ["clients", "users", "reports", "whatsapp_messages"] as const,
  },
];

const admin: ProposalActorContext = {
  userId: "admin-a",
  tenantId: "tenant-a",
  role: "admin",
};

describe("SubscriptionService", () => {
  let provider: FakeBilling;
  let repository: MemorySubscriptions;
  let service: SubscriptionService;

  beforeEach(() => {
    provider = new FakeBilling();
    repository = new MemorySubscriptions();
    service = new SubscriptionService(
      plans,
      repository,
      provider,
      new Decoder(),
      new Audit(),
      () => new Date("2026-07-24T12:00:00.000Z"),
    );
  });

  it("cria checkout HTTPS para plano cadastrado", async () => {
    assert.equal(
      await service.createCheckout(admin, "professional", {
        successUrl: "https://app.test/success",
        cancelUrl: "https://app.test/cancel",
      }),
      "https://billing.test/checkout/1",
    );
  });

  it("processa webhook idempotente sem excluir dados", async () => {
    const event: BillingEvent = {
      id: "event-1",
      tenantId: "tenant-a",
      providerSubscriptionId: "subscription-1",
      type: "subscription.active",
      planId: "professional",
      currentPeriodEnd: "2026-08-24T12:00:00.000Z",
      occurredAt: "2026-07-24T12:00:00.000Z",
    };
    const first = await service.handleWebhook(
      new Headers(),
      JSON.stringify(event),
    );
    const second = await service.handleWebhook(
      new Headers(),
      JSON.stringify(event),
    );
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(repository.subscription?.status, "active");
  });

  it("aplica recursos e limites do plano", async () => {
    repository.subscription = {
      tenantId: "tenant-a",
      planId: "professional",
      status: "active",
      currentPeriodEnd: "2026-08-24T12:00:00.000Z",
    };
    await assert.doesNotReject(
      service.assertAccess("tenant-a", "clients", {
        resource: "clients",
        current: 99,
      }),
    );
    await assert.rejects(
      service.assertAccess("tenant-a", "clients", {
        resource: "clients",
        current: 100,
      }),
      /limite/,
    );
    await assert.rejects(
      service.assertAccess("tenant-a", "ai_assistance"),
      /incluído/,
    );
  });

  it("recusa webhook sem assinatura válida", async () => {
    provider.valid = false;
    await assert.rejects(
      service.handleWebhook(new Headers(), "{}"),
      SubscriptionServiceError,
    );
  });
});
