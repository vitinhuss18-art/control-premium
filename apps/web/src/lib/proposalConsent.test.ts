import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "vitest";

import {
  normalizeSignatureName,
  PROPOSAL_CONSENT_SHA256,
  PROPOSAL_CONSENT_TEXT,
  PROPOSAL_CONSENT_VERSION,
} from "./proposalConsent";

describe("proposal consent", () => {
  it("mantém a versão ligada ao conteúdo exibido", () => {
    const hash = createHash("sha256")
      .update(PROPOSAL_CONSENT_TEXT, "utf8")
      .digest("hex");

    assert.equal(PROPOSAL_CONSENT_VERSION, "proposal-consent-v1-2026-08-11");
    assert.equal(hash, PROPOSAL_CONSENT_SHA256);
  });

  it("normaliza a assinatura digitada sem alterar o conteúdo original", () => {
    assert.equal(
      normalizeSignatureName("  Maria   da Silva  "),
      "maria da silva",
    );
  });
});
