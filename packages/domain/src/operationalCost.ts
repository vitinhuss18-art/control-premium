import type { ProposalSimulation } from "./proposal";

export const operationalCostModes = ["percentage", "fixed"] as const;
export type OperationalCostMode = (typeof operationalCostModes)[number];

export type OperationalCostConfig = Readonly<{
  passThrough: boolean;
  mode?: OperationalCostMode;
  /** Usado quando mode === "percentage". Pontos-base sobre o total (principal + juros). */
  percentageBps?: number;
  /** Usado quando mode === "fixed". Valor fixo em centavos por contrato. */
  fixedCents?: number;
}>;

export type ProposalWithOperationalCost = ProposalSimulation &
  Readonly<{
    operationalCostCents: number;
    totalWithCostsCents: number;
  }>;

export class OperationalCostValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "OperationalCostValidationError";
    this.field = field;
  }
}

function roundedDivision(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function calculateOperationalCostCents(
  baseCents: number,
  config: OperationalCostConfig,
): number {
  if (!config.passThrough) return 0;

  if (config.mode === "percentage") {
    if (
      !Number.isSafeInteger(config.percentageBps) ||
      config.percentageBps === undefined ||
      config.percentageBps < 0 ||
      config.percentageBps > 10_000
    ) {
      throw new OperationalCostValidationError(
        "percentageBps",
        "A porcentagem de custo operacional deve ficar entre 0% e 100%.",
      );
    }
    return Number(
      roundedDivision(
        BigInt(baseCents) * BigInt(config.percentageBps),
        10_000n,
      ),
    );
  }

  if (config.mode === "fixed") {
    if (
      !Number.isSafeInteger(config.fixedCents) ||
      config.fixedCents === undefined ||
      config.fixedCents < 0
    ) {
      throw new OperationalCostValidationError(
        "fixedCents",
        "Informe um valor fixo válido em centavos.",
      );
    }
    return config.fixedCents;
  }

  throw new OperationalCostValidationError(
    "mode",
    "Informe o modo de cálculo do custo operacional (percentual ou fixo).",
  );
}

/**
 * Aplica o custo operacional (quando habilitado pela empresa) sobre uma
 * simulação já pronta (empréstimo ou venda parcelada) e distribui o valor
 * entre as parcelas, usando a mesma técnica de distribuição de centavos do
 * motor principal — nenhuma parcela recebe centavo a mais ou a menos por
 * arredondamento, e a soma sempre bate exatamente.
 *
 * `totalCents` da simulação original é preservado (principal + juros, sem
 * custo). O valor final que o cliente paga é `totalWithCostsCents`.
 */
export function applyOperationalCost(
  simulation: ProposalSimulation,
  config: OperationalCostConfig,
): ProposalWithOperationalCost {
  const operationalCostCents = calculateOperationalCostCents(
    simulation.totalCents,
    config,
  );

  if (operationalCostCents === 0) {
    return Object.freeze({
      ...simulation,
      operationalCostCents: 0,
      totalWithCostsCents: simulation.totalCents,
    });
  }

  const count = BigInt(simulation.installments.length);
  const cost = BigInt(operationalCostCents);
  const base = cost / count;
  const remainder = cost % count;

  const installments = simulation.installments.map((installment, index) =>
    Object.freeze({
      ...installment,
      amountCents:
        installment.amountCents +
        Number(base) +
        (BigInt(index) < remainder ? 1 : 0),
    }),
  );

  return Object.freeze({
    ...simulation,
    installments: Object.freeze(installments),
    operationalCostCents,
    totalWithCostsCents: simulation.totalCents + operationalCostCents,
  });
}
