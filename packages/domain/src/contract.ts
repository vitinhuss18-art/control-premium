export type ContractTemplate = Readonly<{
  id: string;
  version: number;
  body: string;
  requiredFields: readonly string[];
}>;

export type RenderedContract = Readonly<{
  templateId: string;
  templateVersion: number;
  content: string;
  fields: Readonly<Record<string, string>>;
}>;

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

function normalizeFieldValue(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 5_000) {
    throw new ContractValidationError("Campo contratual inválido.");
  }
  return normalized;
}

export function renderContractTemplate(
  template: ContractTemplate,
  fields: Readonly<Record<string, string>>,
): RenderedContract {
  if (
    !template.id.trim() ||
    !Number.isSafeInteger(template.version) ||
    template.version <= 0
  ) {
    throw new ContractValidationError("Versão de modelo contratual inválida.");
  }

  const normalizedFields = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      normalizeFieldValue(value),
    ]),
  );
  const missing = template.requiredFields.filter(
    (field) => !normalizedFields[field],
  );
  if (missing.length > 0) {
    throw new ContractValidationError(
      "Campos contratuais ausentes: " + missing.join(", ") + ".",
    );
  }

  const referenced = [
    ...template.body.matchAll(/\{\{([a-zA-Z0-9_.-]+)\}\}/g),
  ].map((match) => match[1]!);
  const unknown = referenced.filter((field) => !normalizedFields[field]);
  if (unknown.length > 0) {
    throw new ContractValidationError(
      "O modelo possui campos sem valor: " + [...new Set(unknown)].join(", "),
    );
  }

  const content = template.body.replace(
    /\{\{([a-zA-Z0-9_.-]+)\}\}/g,
    (_, field: string) => normalizedFields[field]!,
  );

  return Object.freeze({
    templateId: template.id,
    templateVersion: template.version,
    content,
    fields: Object.freeze(normalizedFields),
  });
}

export function buildContractStoragePath(input: {
  tenantId: string;
  loanId: string;
  contractId: string;
  version: number;
  kind: "original" | "signed" | "addendum";
}): string {
  for (const value of [input.tenantId, input.loanId, input.contractId]) {
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      throw new ContractValidationError(
        "Identificador inválido no caminho contratual.",
      );
    }
  }
  if (!Number.isSafeInteger(input.version) || input.version <= 0) {
    throw new ContractValidationError("Versão contratual inválida.");
  }
  return (
    input.tenantId +
    "/loans/" +
    input.loanId +
    "/contracts/" +
    input.contractId +
    "/v" +
    input.version +
    "/" +
    input.kind +
    ".pdf"
  );
}
