import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";

import type { WhatsAppProvider } from "@control-premium/integrations";

import {
  MessagingPolicyError,
  MessagingService,
  nextAllowedMessageTime,
  type MessageRecord,
  type MessageRepository,
  type MessagingConsentReader,
  type MessagingQuota,
} from "../src/messaging";
import type {
  ProposalActorContext,
  ProposalAuditWriter,
} from "../src/proposals";

const policy = {
  utcOffsetMinutes: -180,
  startMinute: 8 * 60,
  endMinute: 18 * 60,
  allowedWeekdays: [1, 2, 3, 4, 5],
  holidays: ["2026-07-27"],
  maxAttempts: 3,
};

class MemoryMessages implements MessageRepository {
  records: MessageRecord[] = [];
  async findByIdempotencyKey(tenantId: string, key: string) {
    return (
      this.records.find(
        (record) =>
          record.tenantId === tenantId && record.idempotencyKey === key,
      ) ?? null
    );
  }
  async create(record: MessageRecord) {
    this.records.push(record);
    return record;
  }
  async update(
    tenantId: string,
    messageId: string,
    changes: Partial<MessageRecord>,
  ) {
    const current = this.records.find(
      (record) => record.tenantId === tenantId && record.id === messageId,
    )!;
    const updated = { ...current, ...changes } as MessageRecord;
    this.records = this.records.map((record) =>
      record.id === messageId ? updated : record,
    );
    return updated;
  }
}

class FakeWhatsApp implements WhatsAppProvider {
  calls = 0;
  shouldFail = false;
  async sendTemplate() {
    this.calls += 1;
    if (this.shouldFail) throw new Error("provider unavailable");
    return { providerMessageId: "message-1", status: "sent" as const };
  }
  async verifyWebhook() {
    return true;
  }
}

class Consent implements MessagingConsentReader {
  allowed = true;
  async canSend() {
    return this.allowed;
  }
}

class Quota implements MessagingQuota {
  allowed = true;
  async reserve() {
    return this.allowed;
  }
}

class Audit implements ProposalAuditWriter {
  async write() {}
}

const manager: ProposalActorContext = {
  userId: "manager-a",
  tenantId: "tenant-a",
  role: "manager",
};

describe("messaging policy", () => {
  it("move noite, fim de semana e feriado para a próxima janela", () => {
    const fridayNight = new Date("2026-07-24T23:00:00.000Z");
    assert.equal(
      nextAllowedMessageTime(fridayNight, policy).toISOString(),
      "2026-07-28T11:00:00.000Z",
    );
  });
});

describe("MessagingService", () => {
  let repository: MemoryMessages;
  let provider: FakeWhatsApp;
  let consent: Consent;
  let quota: Quota;
  let service: MessagingService;

  beforeEach(() => {
    repository = new MemoryMessages();
    provider = new FakeWhatsApp();
    consent = new Consent();
    quota = new Quota();
    service = new MessagingService(
      repository,
      provider,
      consent,
      quota,
      new Audit(),
      policy,
      {
        registration: ["client_registration"],
        pre_due: ["installment_pre_due"],
        due: ["installment_due"],
        overdue: ["installment_overdue_respectful"],
        payment: ["payment_confirmed"],
        settlement: ["loan_settled"],
        renegotiation: ["renegotiation_invitation"],
      },
      () => "message-1",
      () => new Date("2026-07-24T12:00:00.000Z"),
    );
  });

  async function queue() {
    return service.queueTemplate(manager, {
      idempotencyKey: "message:due:1",
      recipient: "+5511999999999",
      category: "due",
      templateName: "installment_due",
      variables: { amount: "R$ 275,00" },
    });
  }

  it("enfileira template aprovado sem duplicidade", async () => {
    const first = await queue();
    const second = await queue();
    assert.equal(first.id, second.id);
    assert.equal(repository.records.length, 1);
  });

  it("respeita opt-out, template e limite do plano", async () => {
    consent.allowed = false;
    await assert.rejects(queue(), /opt-out/);
    consent.allowed = true;
    quota.allowed = false;
    await assert.rejects(queue(), /limite/);
    quota.allowed = true;
    await assert.rejects(
      service.queueTemplate(manager, {
        idempotencyKey: "message:bad:1",
        recipient: "+5511999999999",
        category: "overdue",
        templateName: "ameaça_livre",
        variables: {},
      }),
      MessagingPolicyError,
    );
  });

  it("envia na janela e registra tentativa sem duplicar provedor", async () => {
    const record = await queue();
    const sent = await service.dispatch(record);
    const repeated = await service.dispatch(sent);
    assert.equal(sent.status, "sent");
    assert.equal(repeated.status, "sent");
    assert.equal(provider.calls, 1);
  });

  it("registra falha sem expor mensagem sensível", async () => {
    const record = await queue();
    provider.shouldFail = true;
    const failed = await service.dispatch(record);
    assert.equal(failed.status, "failed");
    assert.equal(failed.lastError, "Error");
    assert.equal(failed.attempts, 1);
  });
});
