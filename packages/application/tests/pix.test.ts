import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";

import type {
  PixProvider,
  PixWebhookDecoder,
  VerifiedPixWebhook,
} from "@control-premium/integrations";

import {
  PixService,
  PixStateError,
  type PixChargeRecord,
  type PixChargeRepository,
  type PixPaymentRecorder,
} from "../src/pix";
import type {
  ProposalActorContext,
  ProposalAuditWriter,
} from "../src/proposals";

class FakePixProvider implements PixProvider {
  validSignature = true;
  createCount = 0;
  async createCharge(input: {
    amountCents: number;
    expiresAt: string;
  }) {
    this.createCount += 1;
    return {
      providerChargeId: "provider-charge-1",
      amountCents: input.amountCents,
      status: "pending" as const,
      copyAndPasteCode: "000201010212...",
      qrCodeText: "000201010212...",
      expiresAt: input.expiresAt,
    };
  }
  async getCharge() {
    throw new Error("not needed");
  }
  async refundCharge() {
    return { providerRefundId: "refund-1", status: "pending" as const };
  }
  async verifyWebhook() {
    return this.validSignature;
  }
}

class JsonPixDecoder implements PixWebhookDecoder {
  decode(rawBody: string): VerifiedPixWebhook {
    return JSON.parse(rawBody) as VerifiedPixWebhook;
  }
}

class MemoryPixRepository implements PixChargeRepository {
  records: PixChargeRecord[] = [];
  eventIds = new Set<string>();
  async findByIdempotencyKey(tenantId: string, key: string) {
    return (
      this.records.find(
        (record) =>
          record.tenantId === tenantId && record.idempotencyKey === key,
      ) ?? null
    );
  }
  async findByProviderChargeId(providerChargeId: string) {
    return (
      this.records.find(
        (record) => record.providerChargeId === providerChargeId,
      ) ?? null
    );
  }
  async create(record: PixChargeRecord) {
    this.records.push(record);
    return record;
  }
  async applyVerifiedEvent(
    record: PixChargeRecord,
    event: VerifiedPixWebhook,
  ) {
    const duplicate = this.eventIds.has(event.eventId);
    this.eventIds.add(event.eventId);
    if (duplicate) return { record, duplicate };
    const updated: PixChargeRecord = {
      ...record,
      status: event.status,
      ...(event.status === "paid" ? { paidAt: event.occurredAt } : {}),
      ...(event.endToEndId ? { endToEndId: event.endToEndId } : {}),
    };
    this.records = this.records.map((candidate) =>
      candidate.id === record.id ? updated : candidate,
    );
    return { record: updated, duplicate };
  }
  async markRefund(
    tenantId: string,
    chargeId: string,
    input: { refundId: string; status: "pending" | "confirmed" },
  ) {
    const current = this.records.find(
      (record) => record.tenantId === tenantId && record.id === chargeId,
    )!;
    const updated: PixChargeRecord = {
      ...current,
      refundId: input.refundId,
      status: input.status === "confirmed" ? "refunded" : current.status,
    };
    this.records = this.records.map((candidate) =>
      candidate.id === chargeId ? updated : candidate,
    );
    return updated;
  }
}

class MemoryPixPayments implements PixPaymentRecorder {
  records = new Map<string, Parameters<PixPaymentRecorder["record"]>[0]>();
  async record(input: Parameters<PixPaymentRecorder["record"]>[0]) {
    if (!this.records.has(input.idempotencyKey)) {
      this.records.set(input.idempotencyKey, input);
    }
  }
}

class MemoryAudit implements ProposalAuditWriter {
  events: Parameters<ProposalAuditWriter["write"]>[0][] = [];
  async write(event: Parameters<ProposalAuditWriter["write"]>[0]) {
    this.events.push(event);
  }
}

const admin: ProposalActorContext = {
  userId: "admin-a",
  tenantId: "tenant-a",
  role: "admin",
};

describe("PixService", () => {
  let provider: FakePixProvider;
  let repository: MemoryPixRepository;
  let payments: MemoryPixPayments;
  let service: PixService;

  beforeEach(() => {
    provider = new FakePixProvider();
    repository = new MemoryPixRepository();
    payments = new MemoryPixPayments();
    service = new PixService(
      repository,
      provider,
      new JsonPixDecoder(),
      payments,
      new MemoryAudit(),
      () => "pix-charge-1",
      () => new Date("2026-07-24T12:00:00.000Z"),
    );
  });

  async function createCharge() {
    return service.createInstallmentCharge(admin, {
      loanId: "loan-1",
      installmentId: "installment-1",
      amountCents: 27_500,
      expiresAt: "2026-07-25T12:00:00.000Z",
      payerReference: "client-1",
      idempotencyKey: "pix:create:1",
    });
  }

  it("cria cobrança individual idempotente", async () => {
    const first = await createCharge();
    const second = await createCharge();
    assert.equal(first.id, second.id);
    assert.equal(provider.createCount, 1);
    assert.ok(first.copyAndPasteCode);
  });

  it("valida webhook e registra pagamento uma única vez", async () => {
    await createCharge();
    const event: VerifiedPixWebhook = {
      providerChargeId: "provider-charge-1",
      eventId: "event-1",
      endToEndId: "E123",
      status: "paid",
      amountCents: 27_500,
      occurredAt: "2026-07-24T13:00:00.000Z",
    };
    const headers = new Headers();
    const first = await service.handleWebhook(headers, JSON.stringify(event));
    const second = await service.handleWebhook(headers, JSON.stringify(event));

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(payments.records.size, 1);
    assert.equal(repository.records[0]?.status, "paid");
  });

  it("recusa assinatura e valor divergente", async () => {
    await createCharge();
    provider.validSignature = false;
    await assert.rejects(
      service.handleWebhook(new Headers(), "{}"),
      PixStateError,
    );

    provider.validSignature = true;
    await assert.rejects(
      service.handleWebhook(
        new Headers(),
        JSON.stringify({
          providerChargeId: "provider-charge-1",
          eventId: "event-2",
          status: "paid",
          amountCents: 1,
          occurredAt: "2026-07-24T13:00:00.000Z",
        }),
      ),
      /divergente/,
    );
  });

  it("solicita devolução auditável pelo provedor", async () => {
    const charge = await createCharge();
    repository.records[0] = { ...charge, status: "paid" };
    const refunded = await service.refund(admin, repository.records[0]!, {
      amountCents: 27_500,
      idempotencyKey: "pix:refund:1",
    });
    assert.equal(refunded.refundId, "refund-1");
  });
});
