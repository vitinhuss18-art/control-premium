import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

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

export async function POST(req: Request) {
  if (!SUPABASE_URL || !ANON_KEY) {
    return NextResponse.json(
      { message: "Serviço indisponível." },
      { status: 503 },
    );
  }

  const formData: FormData | null = await req.formData().catch(() => null);
  if (!formData) {
    return badRequest("Dados inválidos.");
  }

  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return badRequest("Link de cadastro inválido.");
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const cpf = String(formData.get("cpf") ?? "").replace(/\D/g, "");
  const instagram = String(formData.get("instagram") ?? "").trim();
  const pixKey = String(formData.get("pixKey") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").replace(/\D/g, "");
  const sms = String(formData.get("sms") ?? "").replace(/\D/g, "");
  const address = String(formData.get("address") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const loanAmountCents = Number(formData.get("loanAmountCents") ?? 0);

  if (fullName.length < 3) return badRequest("Informe seu nome completo.");
  if (cpf.length !== 11) return badRequest("CPF inválido.");
  if (!whatsapp) return badRequest("Informe seu WhatsApp.");
  if (!address) return badRequest("Informe seu endereço.");
  if (!region) return badRequest("Informe sua região.");
  if (!loanAmountCents || loanAmountCents <= 0)
    return badRequest("Informe o valor desejado.");

  const photos: Partial<Record<PhotoKey, File>> = {};
  for (const key of PHOTO_KEYS) {
    const file = formData.get(key);
    if (!(file instanceof File) || file.size === 0) {
      return badRequest("Envie todas as 4 fotos obrigatórias.");
    }
    if (file.size > 3 * 1024 * 1024) {
      return badRequest("Cada foto deve ter no máximo 3 MB.");
    }
    photos[key] = file;
  }

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: validation, error: tokenError } = await anonClient
    .rpc("validate_signup_link_token", { p_token: token })
    .single<{ tenant_id: string; link_id: string }>();

  if (tokenError || !validation?.tenant_id || !validation?.link_id) {
    return badRequest("Link de cadastro inválido ou expirado.");
  }
  const tenantId = validation.tenant_id;
  const linkId = validation.link_id;

  const proposalId = crypto.randomUUID();
  const { error: proposalError } = await anonClient
    .from("client_proposals")
    .insert({
      id: proposalId,
      tenant_id: tenantId,
      signup_link_id: linkId,
      full_name: fullName,
      cpf,
      instagram: instagram || null,
      pix_key: pixKey || null,
      whatsapp,
      sms: sms || null,
      address,
      region,
      loan_amount_cents: loanAmountCents,
      status: "pending",
    });

  if (proposalError) {
    console.error("client_proposals insert failed:", {
      message: proposalError.message,
      details: proposalError.details,
      hint: proposalError.hint,
      code: proposalError.code,
    });
    return NextResponse.json(
      { message: "Não foi possível registrar sua proposta." },
      { status: 500 },
    );
  }

  // Link de uso único: uma vez que a proposta foi registrada, o link não pode
  // mais ser reaproveitado (evita que o cliente encaminhe o mesmo link e outra
  // pessoa envie uma segunda proposta usando o convite dele).
  await anonClient.rpc("consume_signup_link", { p_link_id: linkId });

  if (SERVICE_ROLE_KEY) {
    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    for (const [key, file] of Object.entries(photos) as [PhotoKey, File][]) {
      const path = `${tenantId}/proposals/${proposalId}/${key}`;
      const { error: uploadError } = await serviceClient.storage
        .from("client-documents")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        return NextResponse.json(
          { message: "Erro ao enviar fotos. Tente novamente." },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({ ok: true, proposalId });
}
