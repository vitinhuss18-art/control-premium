import { describe, expect, it } from "vitest";

import {
  instanceNameForTenant,
  normalizeBrazilianWhatsApp,
  parseEvolutionConnectedNumber,
  parseEvolutionQrCode,
  parseEvolutionState,
} from "./evolutionApi";

describe("Evolution API helpers", () => {
  it("gera uma instância estável e isolada por empresa", () => {
    expect(instanceNameForTenant("123e4567-e89b-12d3-a456-426614174000")).toBe(
      "cp_123e4567e89b12d3a456426614174000",
    );
  });

  it("normaliza números brasileiros para o formato internacional", () => {
    expect(normalizeBrazilianWhatsApp("(27) 99999-0000")).toBe("5527999990000");
    expect(normalizeBrazilianWhatsApp("5527999990000")).toBe("5527999990000");
  });

  it("interpreta estado, QR Code e número conectado", () => {
    expect(parseEvolutionState({ instance: { state: "open" } })).toBe("open");
    expect(
      parseEvolutionQrCode({
        qrcode: { base64: "data:image/png;base64,AAAA" },
      }),
    ).toBe("data:image/png;base64,AAAA");
    expect(
      parseEvolutionConnectedNumber([
        { ownerJid: "5527999990000@s.whatsapp.net" },
      ]),
    ).toBe("5527999990000");
  });
});
