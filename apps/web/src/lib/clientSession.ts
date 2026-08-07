import { createHmac, timingSafeEqual } from "node:crypto";

// Sessão do cliente (portal /cliente) não usa Supabase Auth de verdade — o
// login é feito por CPF + 4 últimos dígitos do WhatsApp (ver
// client_login_by_cpf() na migration 202607260002). Por isso, depois que o
// servidor confirma essas credenciais contra o banco (com a service_role
// key), ele mesmo assina um token compacto e o guarda num cookie httpOnly.
// O navegador nunca decide sozinho quem ele é: só apresenta o cookie, que só
// o servidor consegue emitir e validar.
//
// O segredo de sessão é independente da chave administrativa do banco. O
// fallback mantém instalações antigas funcionando até CLIENT_SESSION_SECRET
// ser cadastrado, sem expor nenhum segredo ao navegador.

export const CLIENT_SESSION_COOKIE = "cp_client_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 horas

export type ClientSessionPayload = {
  clientId: string;
  tenantId: string;
  fullName: string;
  status: string;
  exp: number; // epoch seconds
};

function getSecret(): string {
  const secret =
    process.env.CLIENT_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("Segredo da sessão do cliente não configurado.");
  }
  return secret;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

function sign(payloadEncoded: string): string {
  return base64UrlEncode(
    createHmac("sha256", getSecret()).update(payloadEncoded).digest("base64"),
  );
}

export function createClientSessionToken(
  payload: Omit<ClientSessionPayload, "exp">,
): string {
  const full: ClientSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadEncoded = base64UrlEncode(JSON.stringify(full));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifyClientSessionToken(
  token: string | undefined | null,
): ClientSessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payloadEncoded = parts[0];
  const signature = parts[1];
  if (!payloadEncoded || !signature) return null;
  let expectedSignature: string;
  try {
    expectedSignature = sign(payloadEncoded);
  } catch {
    return null;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      base64UrlDecode(payloadEncoded),
    ) as ClientSessionPayload;
    if (
      typeof payload.clientId !== "string" ||
      typeof payload.tenantId !== "string" ||
      typeof payload.fullName !== "string" ||
      typeof payload.status !== "string" ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp)
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const CLIENT_SESSION_MAX_AGE_SECONDS = SESSION_TTL_SECONDS;
