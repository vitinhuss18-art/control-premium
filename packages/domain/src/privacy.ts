export type DataCategory =
  | "identity"
  | "contact"
  | "financial_contract"
  | "payment"
  | "communication"
  | "audit"
  | "ai_suggestion";

export type RetentionRecord = Readonly<{
  category: DataCategory;
  retentionUntil: string;
  legalHold: boolean;
  requiredForOpenContract: boolean;
}>;

export type DataDisposition = "retain" | "anonymize" | "delete";

export class PrivacyPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyPolicyError";
  }
}

export function decideDataDisposition(
  record: RetentionRecord,
  at: Date,
): DataDisposition {
  const retentionUntil = new Date(record.retentionUntil);
  if (Number.isNaN(retentionUntil.getTime())) {
    throw new PrivacyPolicyError("Prazo de retenção inválido.");
  }
  if (
    record.legalHold ||
    record.requiredForOpenContract ||
    retentionUntil.getTime() > at.getTime()
  ) {
    return "retain";
  }
  return record.category === "financial_contract" ||
    record.category === "payment" ||
    record.category === "audit"
    ? "anonymize"
    : "delete";
}

export type AnonymizableClient = Readonly<{
  id: string;
  fullName: string;
  cpf?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  address?: Readonly<Record<string, string>>;
}>;

export function anonymizeClient(
  client: AnonymizableClient,
  pseudonym: string,
): AnonymizableClient {
  const normalized = pseudonym.trim();
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(normalized)) {
    throw new PrivacyPolicyError("Pseudônimo inválido.");
  }
  return Object.freeze({
    id: client.id,
    fullName: "Titular anonimizado " + normalized,
  });
}

export function buildPersonalDataExport(input: {
  profile: AnonymizableClient;
  contracts: readonly Readonly<Record<string, unknown>>[];
  payments: readonly Readonly<Record<string, unknown>>[];
  messages: readonly Readonly<Record<string, unknown>>[];
  auditEvents: readonly Readonly<Record<string, unknown>>[];
}): Readonly<Record<string, unknown>> {
  return Object.freeze({
    exportedAt: new Date().toISOString(),
    profile: input.profile,
    contracts: Object.freeze([...input.contracts]),
    payments: Object.freeze([...input.payments]),
    messages: Object.freeze([...input.messages]),
    auditEvents: Object.freeze([...input.auditEvents]),
  });
}
