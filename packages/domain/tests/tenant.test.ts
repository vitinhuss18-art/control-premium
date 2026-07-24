import { describe, expect, it } from "vitest";

import { assertTenantAccess, TenantAccessError } from "../src/tenant";

describe("tenant access", () => {
  it("permite a mesma empresa", () => {
    expect(() => assertTenantAccess("empresa-a", "empresa-a")).not.toThrow();
  });

  it("bloqueia acesso cruzado", () => {
    expect(() => assertTenantAccess("empresa-a", "empresa-b")).toThrow(
      TenantAccessError,
    );
  });
});
