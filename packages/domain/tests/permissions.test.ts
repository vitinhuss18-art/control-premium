import { describe, expect, it } from "vitest";

import { hasPermission } from "../src/permissions";

describe("permissions", () => {
  it("permite ao administrador gerenciar membros e finanças", () => {
    expect(hasPermission("admin", "members.manage")).toBe(true);
    expect(hasPermission("admin", "finance.reverse")).toBe(true);
  });

  it("impede o cobrador de alterar finanças", () => {
    expect(hasPermission("collector", "finance.read")).toBe(true);
    expect(hasPermission("collector", "finance.write")).toBe(false);
    expect(hasPermission("collector", "finance.reverse")).toBe(false);
  });

  it("limita o cliente ao próprio portal", () => {
    expect(hasPermission("client", "portal.read")).toBe(true);
    expect(hasPermission("client", "clients.read")).toBe(false);
  });
});
