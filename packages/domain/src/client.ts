export type ClientStatus =
  "incomplete" | "under_review" | "approved" | "blocked" | "archived";

export type ClientDraft = Readonly<{
  fullName: string;
  cpf?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
}>;

export class ClientValidationError extends Error {
  constructor(
    readonly field: keyof ClientDraft,
    message: string,
  ) {
    super(message);
    this.name = "ClientValidationError";
  }
}

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (length: number): number => {
    let sum = 0;

    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }

    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return (
    calculateDigit(9) === Number(cpf[9]) &&
    calculateDigit(10) === Number(cpf[10])
  );
}

export function normalizeClientDraft(input: ClientDraft): ClientDraft {
  const fullName = input.fullName.trim().replace(/\s+/g, " ");

  if (fullName.length < 3) {
    throw new ClientValidationError(
      "fullName",
      "Informe o nome completo do cliente.",
    );
  }

  const cpf = input.cpf ? normalizeCpf(input.cpf) : undefined;
  if (cpf && !isValidCpf(cpf)) {
    throw new ClientValidationError("cpf", "CPF inválido.");
  }

  const email = input.email?.trim().toLowerCase() || undefined;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ClientValidationError("email", "E-mail inválido.");
  }

  const phone = input.phone?.replace(/[^\d+]/g, "") || undefined;
  if (phone && !/^\+?\d{10,15}$/.test(phone)) {
    throw new ClientValidationError("phone", "Telefone inválido.");
  }

  const birthDate = input.birthDate?.trim() || undefined;
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ClientValidationError(
      "birthDate",
      "Data de nascimento inválida.",
    );
  }

  return Object.freeze({
    fullName,
    ...(cpf ? { cpf } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(birthDate ? { birthDate } : {}),
  });
}
