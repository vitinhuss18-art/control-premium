import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  assertFeatureAccess,
  assertPlanLimit,
  hasSubscriptionAccess,
  SubscriptionAccessError,
  validatePlan,
} from "../src/subscription";

const plan = validatePlan({
  id: "professional",
  name: "Profissional",
  monthlyPriceCents: 19_900,
  limits: {
    clients: 1_000,
    users: 10,
    whatsapp_messages: 5_000,
    storage_bytes: 10_000_000_000,
  },
  features: ["clients", "users", "reports", "whatsapp_messages"],
});

describe("subscription domain", () => {
  it("aplica catálogo, recursos e limites", () => {
    const subscription = {
      tenantId: "tenant-a",
      planId: plan.id,
      status: "active" as const,
      currentPeriodEnd: "2026-08-24T00:00:00.000Z",
    };
    assert.doesNotThrow(() =>
      assertFeatureAccess(
        subscription,
        plan,
        "reports",
        new Date("2026-07-24T00:00:00.000Z"),
      ),
    );
    assert.throws(
      () =>
        assertFeatureAccess(
          subscription,
          plan,
          "ai_assistance",
          new Date("2026-07-24T00:00:00.000Z"),
        ),
      SubscriptionAccessError,
    );
    assert.doesNotThrow(() => assertPlanLimit(plan, "clients", 999));
    assert.throws(() => assertPlanLimit(plan, "clients", 1_000));
  });

  it("mantém tolerância temporária sem apagar dados", () => {
    const subscription = {
      tenantId: "tenant-a",
      planId: plan.id,
      status: "past_due" as const,
      currentPeriodEnd: "2026-07-20T00:00:00.000Z",
      graceUntil: "2026-07-30T00:00:00.000Z",
    };
    assert.equal(
      hasSubscriptionAccess(
        subscription,
        new Date("2026-07-24T00:00:00.000Z"),
      ),
      true,
    );
    assert.equal(
      hasSubscriptionAccess(
        subscription,
        new Date("2026-07-31T00:00:00.000Z"),
      ),
      false,
    );
  });
});
