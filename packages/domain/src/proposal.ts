export const paymentFrequencies = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
] as const;

export type PaymentFrequency = (typeof paymentFrequencies)[number];

export const proposalStatuses = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "expired",
  "converted",
] as const;

export type ProposalStatus = (typeof proposalStatuses)[number];

export const creditPurposes = [
  "working_capital",
  "personal",
  "education",
  "health",
  "other",
] as const;

export type CreditPurpose = (typeof creditPurposes)[number];

export type ProposalSimulationInput = Readonly<{
  principalCents: number;
  installmentCount: number;
  periodicInterestBps: number;
  frequency: PaymentFrequency;
  firstDueDate: string;
  holidays?: readonly string[];
}>;

export type SimulatedInstallment = Readonly<{
  number: number;
  dueDate: string;
  amountCents: number;
}>;

export type ProposalSimulation = Readonly<{
  principalCents: number;
  interestCents: number;
  totalCents: number;
  periodicInterestBps: number;
  installmentCount: number;
  frequency: PaymentFrequency;
  installments: readonly SimulatedInstallment[];
}>;

export const proposalDocumentTypes = [
  "identity",
  "address",
  "income",
  "privacy_acceptance",
] as const;

export type ProposalDocumentType = (typeof proposalDocumentTypes)[number];
export type ChecklistStatus = "missing" | "received" | "verified";

export type ProposalChecklistItem = Readonly<{
  type: ProposalDocumentType;
  status: ChecklistStatus;
  verifiedBy?: string;
  verifiedAt?: string;
}>;

export type CreditScoreInput = Readonly<{
  identityVerified: boolean;
  addressVerified: boolean;
  incomeVerified: boolean;
  relationshipMonths: number;
  debtToIncomeBps: number;
}>;

export type CreditScoreFactor = Readonly<{
  code: string;
  description: string;
  points: number;
}>;

export type ExplainableCreditScore = Readonly<{
  value: number;
  riskBand: "low" | "medium" | "high";
  factors: readonly CreditScoreFactor[];
  requiresHumanDecision: true;
}>;

export class ProposalValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ProposalValidationError";
    this.field = field;
  }
}

function assertSafePositiveInteger(
  value: number,
  field: string,
  message: string,
): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ProposalValidationError(field, message);
  }
}

function parseIsoDate(value: string, field = "date"): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ProposalValidationError(field, "Informe uma data válida.");
  }

  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== value) {
    throw new ProposalValidationError(field, "Informe uma data válida.");
  }

  return date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(targetYear, targetMonth, Math.min(date.getUTCDate(), lastDay)),
  );
}

function isBusinessDay(date: Date, holidays: ReadonlySet<string>): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(toIsoDate(date));
}

function nextBusinessDay(date: Date, holidays: ReadonlySet<string>): Date {
  let adjusted = new Date(date);
  while (!isBusinessDay(adjusted, holidays)) {
    adjusted = addUtcDays(adjusted, 1);
  }
  return adjusted;
}

function addBusinessDays(
  date: Date,
  days: number,
  holidays: ReadonlySet<string>,
): Date {
  let adjusted = nextBusinessDay(date, holidays);
  let remaining = days;

  while (remaining > 0) {
    adjusted = addUtcDays(adjusted, 1);
    if (isBusinessDay(adjusted, holidays)) {
      remaining -= 1;
    }
  }

  return adjusted;
}

function installmentDueDate(
  firstDueDate: Date,
  frequency: PaymentFrequency,
  zeroBasedIndex: number,
  holidays: ReadonlySet<string>,
): string {
  if (frequency === "daily") {
    return toIsoDate(addBusinessDays(firstDueDate, zeroBasedIndex, holidays));
  }

  const unadjusted =
    frequency === "monthly"
      ? addUtcMonthsClamped(firstDueDate, zeroBasedIndex)
      : addUtcDays(
          firstDueDate,
          zeroBasedIndex * (frequency === "weekly" ? 7 : 14),
        );

  return toIsoDate(nextBusinessDay(unadjusted, holidays));
}

function roundedDivision(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function toSafeNumber(value: bigint, field: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ProposalValidationError(
      field,
      "O valor ultrapassa o limite seguro de cálculo.",
    );
  }
  return Number(value);
}

export function simulateProposal(
  input: ProposalSimulationInput,
): ProposalSimulation {
  assertSafePositiveInteger(
    input.principalCents,
    "principalCents",
    "Informe um valor principal positivo em centavos.",
  );
  assertSafePositiveInteger(
    input.installmentCount,
    "installmentCount",
    "Informe uma quantidade válida de parcelas.",
  );
  if (input.installmentCount > 360) {
    throw new ProposalValidationError(
      "installmentCount",
      "A simulação aceita no máximo 360 parcelas.",
    );
  }
  if (
    !Number.isSafeInteger(input.periodicInterestBps) ||
    input.periodicInterestBps < 0 ||
    input.periodicInterestBps > 10_000
  ) {
    throw new ProposalValidationError(
      "periodicInterestBps",
      "A taxa periódica deve ficar entre 0% e 100%.",
    );
  }
  if (!paymentFrequencies.includes(input.frequency)) {
    throw new ProposalValidationError(
      "frequency",
      "Informe uma frequência de pagamento válida.",
    );
  }

  const firstDueDate = parseIsoDate(input.firstDueDate, "firstDueDate");
  const holidays = new Set(
    (input.holidays ?? []).map((holiday) =>
      toIsoDate(parseIsoDate(holiday, "holidays")),
    ),
  );
  const principal = BigInt(input.principalCents);
  const count = BigInt(input.installmentCount);
  const interest = roundedDivision(
    principal * BigInt(input.periodicInterestBps) * count,
    10_000n,
  );
  const total = principal + interest;
  const baseAmount = total / count;
  const remainder = total % count;

  const installments = Array.from(
    { length: input.installmentCount },
    (_, index): SimulatedInstallment => ({
      number: index + 1,
      dueDate: installmentDueDate(
        firstDueDate,
        input.frequency,
        index,
        holidays,
      ),
      amountCents: toSafeNumber(
        baseAmount + (BigInt(index) < remainder ? 1n : 0n),
        "installments",
      ),
    }),
  );

  return Object.freeze({
    principalCents: input.principalCents,
    interestCents: toSafeNumber(interest, "interestCents"),
    totalCents: toSafeNumber(total, "totalCents"),
    periodicInterestBps: input.periodicInterestBps,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    installments: Object.freeze(installments),
  });
}

export function createProposalChecklist(): readonly ProposalChecklistItem[] {
  return Object.freeze(
    proposalDocumentTypes.map((type) =>
      Object.freeze({ type, status: "missing" as const }),
    ),
  );
}

export function validateProposalChecklist(
  items: readonly ProposalChecklistItem[],
): readonly ProposalChecklistItem[] {
  const unique = new Set(items.map((item) => item.type));
  if (
    items.length !== proposalDocumentTypes.length ||
    unique.size !== proposalDocumentTypes.length ||
    proposalDocumentTypes.some((type) => !unique.has(type))
  ) {
    throw new ProposalValidationError(
      "checklist",
      "O checklist documental está incompleto ou duplicado.",
    );
  }

  for (const item of items) {
    if (item.status === "verified" && (!item.verifiedBy || !item.verifiedAt)) {
      throw new ProposalValidationError(
        "checklist",
        "Documentos verificados exigem responsável e horário.",
      );
    }
  }

  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

export function isProposalChecklistComplete(
  items: readonly ProposalChecklistItem[],
): boolean {
  return validateProposalChecklist(items).every(
    (item) => item.status === "verified",
  );
}

export function calculateExplainableCreditScore(
  input: CreditScoreInput,
): ExplainableCreditScore {
  if (
    !Number.isSafeInteger(input.relationshipMonths) ||
    input.relationshipMonths < 0 ||
    input.relationshipMonths > 1_200
  ) {
    throw new ProposalValidationError(
      "relationshipMonths",
      "O tempo de relacionamento é inválido.",
    );
  }
  if (
    !Number.isSafeInteger(input.debtToIncomeBps) ||
    input.debtToIncomeBps < 0 ||
    input.debtToIncomeBps > 10_000
  ) {
    throw new ProposalValidationError(
      "debtToIncomeBps",
      "A relação entre dívida e renda deve ficar entre 0% e 100%.",
    );
  }

  const relationshipPoints = Math.min(
    15,
    Math.floor(input.relationshipMonths / 4),
  );
  const debtPoints =
    input.debtToIncomeBps <= 3_000
      ? 15
      : input.debtToIncomeBps <= 5_000
        ? 8
        : 0;
  const factors: readonly CreditScoreFactor[] = Object.freeze([
    {
      code: "identity_verified",
      description: "Identidade documental verificada",
      points: input.identityVerified ? 20 : 0,
    },
    {
      code: "address_verified",
      description: "Endereço documental verificado",
      points: input.addressVerified ? 15 : 0,
    },
    {
      code: "income_verified",
      description: "Renda documental verificada",
      points: input.incomeVerified ? 35 : 0,
    },
    {
      code: "relationship_length",
      description: "Tempo de relacionamento",
      points: relationshipPoints,
    },
    {
      code: "debt_to_income",
      description: "Relação entre dívida e renda declarada",
      points: debtPoints,
    },
  ]);
  const value = factors.reduce((total, factor) => total + factor.points, 0);

  return Object.freeze({
    value,
    riskBand: value >= 80 ? "low" : value >= 50 ? "medium" : "high",
    factors,
    requiresHumanDecision: true,
  });
}
