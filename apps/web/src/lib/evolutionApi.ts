type JsonRecord = Record<string, unknown>;

export type EvolutionConnectionState = "open" | "connecting" | "close";

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EvolutionApiError";
  }
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function configuration(): { baseUrl: string; apiKey: string } {
  const rawUrl = process.env.EVOLUTION_API_URL?.trim() ?? "";
  const apiKey = process.env.EVOLUTION_API_KEY?.trim() ?? "";
  if (!rawUrl || !apiKey) {
    throw new EvolutionApiError(
      "Evolution API ainda não foi configurada na hospedagem.",
      503,
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EvolutionApiError("Endereço da Evolution API inválido.", 503);
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new EvolutionApiError(
      "A Evolution API precisa usar uma conexão HTTPS.",
      503,
    );
  }

  return { baseUrl: url.origin, apiKey };
}

export function isEvolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_API_URL?.trim() &&
    process.env.EVOLUTION_API_KEY?.trim(),
  );
}

export function instanceNameForTenant(tenantId: string): string {
  const compact = tenantId.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (compact.length !== 32) {
    throw new EvolutionApiError("Identificação da empresa inválida.", 400);
  }
  return `cp_${compact}`;
}

export function normalizeBrazilianWhatsApp(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (
    digits.startsWith("55") &&
    (digits.length === 12 || digits.length === 13)
  ) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  if (!/^55[1-9][0-9]{9,10}$/.test(digits)) {
    throw new EvolutionApiError(
      "Informe um WhatsApp brasileiro válido, com DDD.",
      400,
    );
  }
  return digits;
}

function sanitizePathPart(value: string): string {
  if (!/^cp_[0-9a-f]{32}$/.test(value)) {
    throw new EvolutionApiError("Instância de WhatsApp inválida.", 400);
  }
  return encodeURIComponent(value);
}

async function evolutionRequest(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const { baseUrl, apiKey } = configuration();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      apikey: apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      text(record(data)?.message) ??
      text(record(record(data)?.response)?.message) ??
      `Evolution API retornou HTTP ${response.status}`;
    throw new EvolutionApiError(message.slice(0, 240), response.status);
  }
  return data;
}

export function parseEvolutionState(value: unknown): EvolutionConnectionState {
  const root = record(value);
  const instance = record(root?.instance);
  const raw = (
    text(instance?.state) ??
    text(instance?.status) ??
    text(root?.state) ??
    text(root?.connectionStatus) ??
    "close"
  ).toLowerCase();
  if (raw === "open" || raw === "connected") return "open";
  if (raw === "connecting") return "connecting";
  return "close";
}

export function parseEvolutionQrCode(value: unknown): string | null {
  const root = record(value);
  const qrcode = record(root?.qrcode);
  const candidate =
    text(qrcode?.base64) ??
    text(root?.base64) ??
    text(root?.qr) ??
    text(root?.qrcode);
  if (!candidate || candidate.length > 2_000_000) return null;
  if (candidate.startsWith("data:image/")) return candidate;
  if (/^[A-Za-z0-9+/=\s]+$/.test(candidate)) {
    return `data:image/png;base64,${candidate.replace(/\s/g, "")}`;
  }
  return null;
}

function digitsFromOwner(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const beforeDomain = raw.split("@")[0]?.split(":")[0] ?? raw;
  const digits = beforeDomain.replace(/\D/g, "");
  return /^55[1-9][0-9]{9,10}$/.test(digits) ? digits : null;
}

export function parseEvolutionConnectedNumber(value: unknown): string | null {
  const item = Array.isArray(value) ? value[0] : value;
  const root = record(item);
  const instance = record(root?.instance);
  const candidates = [
    root?.ownerJid,
    root?.owner,
    root?.number,
    instance?.ownerJid,
    instance?.owner,
    instance?.number,
  ];
  for (const candidate of candidates) {
    const digits = digitsFromOwner(candidate);
    if (digits) return digits;
  }
  return null;
}

export async function getEvolutionConnectionState(
  instanceName: string,
): Promise<EvolutionConnectionState | null> {
  try {
    const data = await evolutionRequest(
      `/instance/connectionState/${sanitizePathPart(instanceName)}`,
    );
    return parseEvolutionState(data);
  } catch (error) {
    if (error instanceof EvolutionApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createEvolutionInstance(instanceName: string): Promise<{
  state: EvolutionConnectionState;
  qrCode: string | null;
}> {
  const data = await evolutionRequest("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: false,
      readStatus: false,
    }),
  });
  return {
    state: parseEvolutionState(data),
    qrCode: parseEvolutionQrCode(data),
  };
}

export async function connectEvolutionInstance(instanceName: string): Promise<{
  state: EvolutionConnectionState;
  qrCode: string | null;
}> {
  const data = await evolutionRequest(
    `/instance/connect/${sanitizePathPart(instanceName)}`,
  );
  return {
    state: parseEvolutionState(data),
    qrCode: parseEvolutionQrCode(data),
  };
}

export async function ensureEvolutionInstance(instanceName: string): Promise<{
  state: EvolutionConnectionState;
  qrCode: string | null;
}> {
  const state = await getEvolutionConnectionState(instanceName);
  if (state === null) return createEvolutionInstance(instanceName);
  if (state === "open") return { state, qrCode: null };
  return connectEvolutionInstance(instanceName);
}

export async function getEvolutionConnectedNumber(
  instanceName: string,
): Promise<string | null> {
  const data = await evolutionRequest(
    `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
  );
  return parseEvolutionConnectedNumber(data);
}

export async function logoutEvolutionInstance(
  instanceName: string,
): Promise<void> {
  await evolutionRequest(`/instance/logout/${sanitizePathPart(instanceName)}`, {
    method: "DELETE",
  });
}

export async function sendEvolutionText(input: {
  instanceName: string;
  recipient: string;
  message: string;
}): Promise<{ providerMessageId: string }> {
  const data = await evolutionRequest(
    `/message/sendText/${sanitizePathPart(input.instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({ number: input.recipient, text: input.message }),
    },
  );
  const root = record(data);
  const key = record(root?.key);
  const providerMessageId =
    text(key?.id) ?? text(root?.messageId) ?? text(root?.id);
  if (!providerMessageId) {
    throw new EvolutionApiError(
      "A Evolution API não confirmou o identificador da mensagem.",
      502,
    );
  }
  return { providerMessageId };
}
