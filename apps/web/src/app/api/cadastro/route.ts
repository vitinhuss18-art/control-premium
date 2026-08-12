import { createHmac } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { isValidCpf } from "@control-premium/domain";
import {
  normalizeSignatureName,
  PROPOSAL_CONSENT_SHA256,
  PROPOSAL_CONSENT_VERSION,
} from "../../../lib/proposalConsent";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DOCUMENTS_BUCKET =
  process.env.SUPABASE_DOCUMENTS_BUCKET ?? "client-documents";

const MAX_PHOTO_BYTES = 900 * 1024;
const MAX_LOAN_AMOUNT_CENTS = 2_147_483_647;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type PhotoKey = "foto" | "docFrente" | "docVerso" | "fachada";

const PHOTO_KEYS: readonly PhotoKey[] = [
  "foto",
  "docFrente",
  "docVerso",
  "fachada",
];

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

function unavailable() {
  return NextResponse.json(
    { message: "Serviço indisponível." },
    { status: 503 },
  );
}

function isMissingAtomicFunction(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST202" ||
    (/submit_client_proposal_with_consent/i.test(error.message ?? "") &&
      /not find|does not exist|schema cache/i.test(error.message ?? ""))
  );
}

function buildIpHash(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || req.headers.get("x-real-ip")?.trim();
  if (!address) return null;

  return createHmac("sha256", SERVICE_ROLE_KEY)
    .update(`proposal-consent-ip:${address}`, "utf8")
    .digest("hex");
}

export async function POST(req: Request) {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return unavailable();
  }

  const formData: FormData | null = await req.formData().catch(() => null);
  if (!formData) return badRequest("Dados inválidos.");

  const token = String(formData.get("token") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const cpf = String(formData.get("cpf") ?? "").replace(/\D/g, "");
  const instagram = String(formData.get("instagram") ?? "").trim();
  const pixKey = String(formData.get("pixKey") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").replace(/\D/g, "");
  const sms = String(formData.get("sms") ?? "").replace(/\D/g, "");
  const address = String(formData.get("address") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const loanAmountCents = Number(formData.get("loanAmountCents") ?? 0);
  const signatureName = String(formData.get("signatureName") ?? "").trim();
  const consentAccepted = formData.get("consentAccepted") === "true";

  if (!token || token.length > 256)
    return badRequest("Link de cadastro inválido.");
  if (fullName.length < 3 || fullName.length > 120)
    return badRequest("Informe seu nome completo.");
  if (!isValidCpf(cpf)) return badRequest("CPF inválido.");
  if (whatsapp.length < 10 || whatsapp.length > 15)
    return badRequest("Informe um WhatsApp válido.");
  if (sms && (sms.length < 10 || sms.length > 15))
    return badRequest("Informe um telefone SMS válido.");
  if (!address || address.length > 500)
    return badRequest("Informe seu endereço.");
  if (!region || region.length > 100) return badRequest("Informe sua região.");
  if (instagram.length > 100 || pixKey.length > 200)
    return badRequest("Revise os dados informados.");
  if (
    !Number.isSafeInteger(loanAmountCents) ||
    loanAmountCents <= 0 ||
    loanAmountCents > MAX_LOAN_AMOUNT_CENTS
  ) {
    return badRequest("Informe um valor desejado válido.");
  }
  if (!consentAccepted) {
    return badRequest("Leia e aceite o termo para enviar a proposta.");
  }
  if (
    signatureName.length < 3 ||
    signatureName.length > 120 ||
    normalizeSignatureName(signatureName) !== normalizeSignatureName(fullName)
  ) {
    return badRequest(
      "A assinatura deve ser igual ao nome completo informado.",
    );
  }

  const photos: Record<PhotoKey, File> = {} as Record<PhotoKey, File>;
  for (const key of PHOTO_KEYS) {
    const file = formData.get(key);
    if (!(file instanceof File) || file.size === 0) {
      return badRequest("Envie todas as 4 fotos obrigatórias.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return badRequest("Cada foto deve ter no máximo 900 KB.");
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      return badRequest("Envie as fotos em JPEG, PNG, WEBP ou HEIC.");
    }
    photos[key] = file;
  }

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: validation, error: tokenError } = await anonClient
    .rpc("validate_signup_link_token", { p_token: token })
    .single<{ tenant_id: string; link_id: string }>();
  if (tokenError || !validation?.tenant_id || !validation.link_id) {
    return badRequest("Link de cadastro inválido ou expirado.");
  }

  const proposalId = crypto.randomUUID();
  const objectPaths = Object.fromEntries(
    PHOTO_KEYS.map((key) => [
      key,
      `${validation.tenant_id}/proposals/${proposalId}/${key}`,
    ]),
  ) as Record<PhotoKey, string>;
  const cleanupObjects = async () => {
    const { error } = await serviceClient.storage
      .from(DOCUMENTS_BUCKET)
      .remove(Object.values(objectPaths));
    if (error) {
      console.error("client proposal document cleanup failed", {
        code: error.name,
      });
    }
  };

  const uploadResults = await Promise.all(
    PHOTO_KEYS.map((key) =>
      serviceClient.storage
        .from(DOCUMENTS_BUCKET)
        .upload(objectPaths[key], photos[key], {
          contentType: photos[key].type,
          upsert: false,
        }),
    ),
  );
  if (uploadResults.some(({ error }) => error)) {
    await cleanupObjects();
    return NextResponse.json(
      { message: "Erro ao enviar fotos. Tente novamente." },
      { status: 500 },
    );
  }

  const proposalPayload = {
    p_token: token,
    p_proposal_id: proposalId,
    p_full_name: fullName,
    p_cpf: cpf,
    p_instagram: instagram || null,
    p_pix_key: pixKey || null,
    p_whatsapp: whatsapp,
    p_sms: sms || null,
    p_address: address,
    p_region: region,
    p_loan_amount_cents: loanAmountCents,
    p_consent_version: PROPOSAL_CONSENT_VERSION,
    p_consent_sha256: PROPOSAL_CONSENT_SHA256,
    p_signer_name: signatureName,
    p_ip_hash: buildIpHash(req),
    p_user_agent: req.headers.get("user-agent")?.slice(0, 512) ?? null,
    p_request_id: crypto.randomUUID(),
  };
  const { error: atomicError } = await anonClient.rpc(
    "submit_client_proposal_with_consent",
    proposalPayload,
  );

  if (atomicError && isMissingAtomicFunction(atomicError)) {
    await cleanupObjects();
    return NextResponse.json(
      {
        message:
          "O cadastro está sendo atualizado. Tente novamente em instantes.",
      },
      { status: 503 },
    );
  }
  if (atomicError) {
    await cleanupObjects();
    return badRequest("Link de cadastro inválido, expirado ou já utilizado.");
  }

  return NextResponse.json(
    { ok: true, proposalId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
