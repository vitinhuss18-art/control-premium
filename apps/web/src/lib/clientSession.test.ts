import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createClientSessionToken,
  verifyClientSessionToken,
} from "./clientSession";

const payload = {
  clientId: "client-1",
  tenantId: "tenant-1",
  fullName: "Cliente Teste",
  status: "approved",
};

describe("client session", () => {
  beforeEach(() => {
    process.env.CLIENT_SESSION_SECRET = "s".repeat(48);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
  });

  afterEach(() => {
    delete process.env.CLIENT_SESSION_SECRET;
    vi.useRealTimers();
  });

  it("aceita um token íntegro dentro da validade", () => {
    const token = createClientSessionToken(payload);
    expect(verifyClientSessionToken(token)).toMatchObject(payload);
  });

  it("rejeita assinatura adulterada", () => {
    const token = createClientSessionToken(payload);
    const altered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verifyClientSessionToken(altered)).toBeNull();
  });

  it("rejeita token expirado", () => {
    const token = createClientSessionToken(payload);
    vi.advanceTimersByTime(13 * 60 * 60 * 1000);
    expect(verifyClientSessionToken(token)).toBeNull();
  });
});
