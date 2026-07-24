export type Money = Readonly<{
  currency: "BRL";
  cents: number;
}>;

export function brl(cents: number): Money {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(
      "O valor monetário deve ser informado em centavos inteiros.",
    );
  }

  return Object.freeze({ currency: "BRL", cents });
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new TypeError("Não é possível somar moedas diferentes.");
  }

  return brl(left.cents + right.cents);
}

export function formatMoney(value: Money): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: value.currency,
  }).format(value.cents / 100);
}
