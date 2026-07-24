import { hasPermission } from "@control-premium/domain";

import type { ProposalActorContext, ProposalAuditWriter } from "./proposals";

export type AIAssistanceTask =
  | "message_draft"
  | "portfolio_summary"
  | "priority_explanation"
  | "anomaly_review";

export type AISuggestion = Readonly<{
  id: string;
  tenantId: string;
  task: AIAssistanceTask;
  model: string;
  promptVersion: string;
  output: string;
  status: "pending_review" | "approved" | "rejected";
  inputFlags: readonly string[];
  outputFlags: readonly string[];
  tokenCount: number;
  costCents: number;
  createdBy: string;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}>;

export interface AIProvider {
  generate(input: {
    task: AIAssistanceTask;
    prompt: string;
    maxOutputTokens: number;
  }): Promise<{
    model: string;
    text: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  }>;
}

export interface AISuggestionRepository {
  create(suggestion: AISuggestion): Promise<AISuggestion>;
  findById(
    tenantId: string,
    suggestionId: string,
  ): Promise<AISuggestion | null>;
  update(
    tenantId: string,
    suggestionId: string,
    changes: Partial<AISuggestion>,
  ): Promise<AISuggestion>;
  monthlyCostCents(tenantId: string, month: string): Promise<number>;
}

export type AIUsagePolicy = Readonly<{
  enabled: boolean;
  monthlyBudgetCents: number;
  maxOutputTokens: number;
  promptVersion: string;
}>;

export class AIPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIPolicyError";
  }
}

const sensitiveKey =
  /cpf|cnpj|email|phone|telefone|address|endereco|token|secret|password|pix|document/i;

export function maskSensitiveData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitiveData);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        sensitiveKey.test(key) ? "[MASKED]" : maskSensitiveData(nested),
      ]),
    );
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/\+?\d[\d\s().-]{9,}\d/g, "[PHONE]");
}

export function detectPromptInjection(value: string): readonly string[] {
  const flags: string[] = [];
  const patterns: readonly [string, RegExp][] = [
    ["ignore_instructions", /ignore (all|previous|prior) instructions/i],
    ["ignore_instructions_pt", /ignore (todas|as) instru[cç][oõ]es/i],
    ["system_prompt", /(system prompt|prompt do sistema)/i],
    [
      "secret_exfiltration",
      /(reveal|mostre|exiba).*(token|secret|senha|chave)/i,
    ],
  ];
  for (const [code, pattern] of patterns) {
    if (pattern.test(value)) flags.push(code);
  }
  return Object.freeze(flags);
}

function permissionForTask(task: AIAssistanceTask) {
  return task === "message_draft"
    ? ("collections.manage" as const)
    : task === "portfolio_summary" || task === "anomaly_review"
      ? ("finance.read" as const)
      : ("proposals.read" as const);
}

export class AIAssistanceService {
  private readonly provider: AIProvider;
  private readonly suggestions: AISuggestionRepository;
  private readonly audit: ProposalAuditWriter;
  private readonly policy: AIUsagePolicy;
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    provider: AIProvider,
    suggestions: AISuggestionRepository,
    audit: ProposalAuditWriter,
    policy: AIUsagePolicy,
    createId: () => string,
    now: () => Date = () => new Date(),
  ) {
    this.provider = provider;
    this.suggestions = suggestions;
    this.audit = audit;
    this.policy = policy;
    this.createId = createId;
    this.now = now;
  }

  async generate(
    context: ProposalActorContext,
    task: AIAssistanceTask,
    data: unknown,
  ): Promise<AISuggestion> {
    if (!this.policy.enabled) {
      throw new AIPolicyError("A assistência por IA está desligada.");
    }
    if (!hasPermission(context.role, permissionForTask(task))) {
      throw new AIPolicyError("Usuário sem permissão para esta assistência.");
    }
    if (
      !Number.isSafeInteger(this.policy.monthlyBudgetCents) ||
      this.policy.monthlyBudgetCents < 0 ||
      !Number.isSafeInteger(this.policy.maxOutputTokens) ||
      this.policy.maxOutputTokens <= 0
    ) {
      throw new AIPolicyError("Política de custo da IA inválida.");
    }

    const now = this.now();
    const month = now.toISOString().slice(0, 7);
    const spent = await this.suggestions.monthlyCostCents(
      context.tenantId,
      month,
    );
    if (spent >= this.policy.monthlyBudgetCents) {
      throw new AIPolicyError("O limite mensal de custo da IA foi atingido.");
    }

    const masked = maskSensitiveData(data);
    const serialized = JSON.stringify(masked);
    const inputFlags = detectPromptInjection(serialized);
    if (inputFlags.length > 0) {
      throw new AIPolicyError(
        "O conteúdo contém instruções não confiáveis e exige revisão manual.",
      );
    }
    const prompt =
      "Tarefa: " +
      task +
      "\nUse somente os dados mascarados abaixo. Não tome decisões de crédito, " +
      "não envie mensagens e apresente fatos verificáveis para revisão humana.\n" +
      serialized;
    const generated = await this.provider.generate({
      task,
      prompt,
      maxOutputTokens: this.policy.maxOutputTokens,
    });
    if (
      !Number.isSafeInteger(generated.costCents) ||
      generated.costCents < 0 ||
      spent + generated.costCents > this.policy.monthlyBudgetCents
    ) {
      throw new AIPolicyError("A geração ultrapassaria o limite mensal de IA.");
    }
    const output = generated.text.trim();
    if (!output)
      throw new AIPolicyError("O provedor retornou uma saída vazia.");
    const outputFlags = detectPromptInjection(output);
    const suggestion = await this.suggestions.create({
      id: this.createId(),
      tenantId: context.tenantId,
      task,
      model: generated.model,
      promptVersion: this.policy.promptVersion,
      output,
      status: "pending_review",
      inputFlags,
      outputFlags,
      tokenCount: generated.inputTokens + generated.outputTokens,
      costCents: generated.costCents,
      createdBy: context.userId,
      createdAt: now.toISOString(),
    });
    await this.audit.write({
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "ai.suggestion.created",
      entityType: "ai_suggestion",
      entityId: suggestion.id,
      details: {
        task,
        model: generated.model,
        promptVersion: this.policy.promptVersion,
        costCents: generated.costCents,
      },
    });
    return suggestion;
  }

  async review(
    context: ProposalActorContext,
    suggestionId: string,
    outcome: "approved" | "rejected",
  ): Promise<AISuggestion> {
    const suggestion = await this.suggestions.findById(
      context.tenantId,
      suggestionId,
    );
    if (!suggestion) throw new AIPolicyError("Sugestão de IA não encontrada.");
    if (
      suggestion.status !== "pending_review" ||
      !hasPermission(context.role, permissionForTask(suggestion.task))
    ) {
      throw new AIPolicyError("A sugestão não pode ser revisada.");
    }
    const reviewed = await this.suggestions.update(
      context.tenantId,
      suggestionId,
      {
        status: outcome,
        reviewedBy: context.userId,
        reviewedAt: this.now().toISOString(),
      },
    );
    await this.audit.write({
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "ai.suggestion." + outcome,
      entityType: "ai_suggestion",
      entityId: suggestionId,
    });
    return reviewed;
  }
}
