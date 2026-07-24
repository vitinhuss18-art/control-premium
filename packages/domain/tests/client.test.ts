import { describe, expect, it } from "vitest";

import {
  ClientValidationError,
  isValidCpf,
  normalizeClientDraft,
  normalizeCpf,
} from "../src/client";

describe("client", () => {
  it("normaliza os dados sem usar CPF como credencial", () => {
    expect(
      normalizeClientDraft({
        fullName: "  Cliente   Fictício  ",
        cpf: "529.982.247-25",
        phone: "+55 (11) 99999-9999",
        email: "CLIENTE@EXAMPLE.INVALID",
      }),
    ).toEqual({
      fullName: "Cliente Fictício",
      cpf: "52998224725",
      phone: "+5511999999999",
      email: "cliente@example.invalid",
    });
  });

  it("valida o algoritmo de CPF", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("rejeita dados inválidos com indicação do campo", () => {
    expect(() => normalizeClientDraft({ fullName: "A", cpf: "123" })).toThrow(
      ClientValidationError,
    );
  });
});
