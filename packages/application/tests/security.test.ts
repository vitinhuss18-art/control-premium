import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  assertSafeRedirect,
  RateLimitExceededError,
  RateLimiter,
  redactSecurityLog,
  SecurityPolicyError,
  type RateLimitStore,
} from "../src/security";

class MemoryRateLimit implements RateLimitStore {
  counts = new Map<string, number>();
  async consume(input: { key: string; windowStart: string }) {
    const key = input.key + ":" + input.windowStart;
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { count };
  }
}

describe("security policies", () => {
  it("limita tentativas sem armazenar identidade em claro", async () => {
    const store = new MemoryRateLimit();
    const limiter = new RateLimiter(
      store,
      () => new Date("2026-07-24T12:00:10.000Z"),
    );
    const policy = { scope: "login", limit: 2, windowSeconds: 60 };
    await limiter.assertAllowed(policy, "user@example.invalid");
    await limiter.assertAllowed(policy, "user@example.invalid");
    await assert.rejects(
      limiter.assertAllowed(policy, "user@example.invalid"),
      RateLimitExceededError,
    );
    assert.equal([...store.counts.keys()][0]?.includes("user@"), false);
  });

  it("remove segredos de logs em profundidade", () => {
    assert.deepEqual(
      redactSecurityLog({
        user: "admin",
        nested: { authorization: "Bearer secret", value: 1 },
      }),
      {
        user: "admin",
        nested: { authorization: "[REDACTED]", value: 1 },
      },
    );
  });

  it("aceita somente retorno HTTPS para origem permitida", () => {
    assert.equal(
      assertSafeRedirect(
        "https://app.controlpremium.test/return",
        ["https://app.controlpremium.test"],
      ).pathname,
      "/return",
    );
    assert.throws(
      () =>
        assertSafeRedirect("https://evil.test", [
          "https://app.controlpremium.test",
        ]),
      SecurityPolicyError,
    );
  });
});
