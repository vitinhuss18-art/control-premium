import { describe, expect, it } from "vitest";

import { addMoney, brl, formatMoney } from "../src/money";

describe("money", () => {
  it("mantém valores em centavos inteiros", () => {
    expect(addMoney(brl(1_005), brl(995))).toEqual(brl(2_000));
  });

  it("rejeita centavos fracionários", () => {
    expect(() => brl(10.5)).toThrow(TypeError);
  });

  it("formata BRL sem alterar o valor", () => {
    expect(formatMoney(brl(123_45))).toContain("123,45");
  });
});
