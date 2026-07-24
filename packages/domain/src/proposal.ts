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

function nextBusinessDay(
  date: Date,
  holidays: ReadonlySet<string>,
): Date {
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
  if (!paymentF…2947 tokens truncated…trim() ||
    !Number.isSafeInteger(plan.monthlyPriceCents) ||
    plan.monthlyPriceCents < 0
  ) {
    throw new SubscriptionAccessError("Plano SaaS inválido.");
  }
  for (const [limit, value] of Object.entries(plan.limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new SubscriptionAccessError(
        "Limite inválido no plano: " + limit + ".",
      );
    }
  }
  return Object.freeze({
    ...plan,
    limits: Object.freeze({ ...plan.limits }),
    features: Object.freeze([...new Set(plan.features)]),
  });
}

export function hasSubscriptionAccess(
  subscription: TenantSubscription,
  at: Date,
): boolean {
  if (
    subscription.status === "active" ||
    subscription.status === "trialing"
  ) {
    return true;
  }
  return (
    subscription.status === "past_due" &&
    Boolean(
      subscription.graceUntil &&
        new Date(subscription.graceUntil).getTime() > at.getTime(),
    )
  );
}

export function assertFeatureAccess(
  subscription: TenantSubscription,
  plan: SaaSPlan,
  feature: SaaSFeature,
  at: Date,
): void {
  if (!hasSubscriptionAccess(subscription, at)) {
    throw new SubscriptionAccessError(
      "A assinatura não está ativa para novos lançamentos.",
    );
  }
  if (!plan.features.includes(feature)) {
    throw new SubscriptionAccessError(
      "O recurso não está incluído no plano contratado.",
    );
  }
}

export function assertPlanLimit(
  plan: SaaSPlan,
  resource: keyof SaaSPlan["limits"],
  currentUsage: number,
  increment = 1,
): void {
  if (
    !Number.isSafeInteger(currentUsage) ||
    currentUsage < 0 ||
    !Number.isSafeInteger(increment) ||
    increment < 0
  ) {
    throw new SubscriptionAccessError("Consumo do plano inválido.");
  }
  if (currentUsage + increment > plan.limits[resource]) {
    throw new SubscriptionAccessError(
      "O limite de " + resource + " do plano foi atingido.",
    );
  }
}
