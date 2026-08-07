import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  CLIENT_SESSION_COOKIE,
  CLIENT_SESSION_MAX_AGE_SECONDS,
  createClientSessionToken,
} from "@/lib/clientSession";

const genericError = "CPF ou WhatsApp não conferem.";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { message: "Login indisponível no momento." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    cpf?: unknown;
    phoneLast4?: unknown;
  } | null;
  const cpf = typeof body?.cpf === "string" ? body.cpf.replace(/\D/g, "") : "";
  const phoneLast4 =
    typeof body?.phoneLast4 === "string"
      ? body.phoneLast4.replace(/\D/g, "")
      : "";
  if (cpf.length !== 11 || phoneLast4.length !== 4) {
    return NextResponse.json({ message: genericError }, { status: 401 });
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const { data: rateLimit, error: rateLimitError } = await service.rpc(
    "consume_login_rate_limit",
    {
      p_scope: "client",
      p_identity: `${cpf}:${ip ?? "unknown"}`,
      p_limit: 5,
      p_window_seconds: 900,
    },
  );
  const rate = Array.isArray(rateLimit) ? rateLimit[0] : null;
  if (rateLimitError || !rate?.allowed) {
    return NextResponse.json(
      {
        message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate?.retry_after ?? 900) },
      },
    );
  }

  const { data, error } = await service.rpc("client_login_by_cpf", {
    p_cpf: cpf,
    p_phone_last4: phoneLast4,
  });
  if (error || !data || data.length === 0) {
    return NextResponse.json({ message: genericError }, { status: 401 });
  }
  const client = data[0] as {
    client_id: string;
    full_name: string;
    status: string;
  };

  const { data: clientRow, error: clientRowError } = await service
    .from("clients")
    .select("tenant_id")
    .eq("id", client.client_id)
    .maybeSingle();
  if (clientRowError || !clientRow?.tenant_id) {
    return NextResponse.json({ message: genericError }, { status: 401 });
  }

  await service.rpc("reset_login_rate_limit", {
    p_scope: "client",
    p_identity: `${cpf}:${ip ?? "unknown"}`,
  });

  const token = createClientSessionToken({
    clientId: client.client_id,
    tenantId: clientRow.tenant_id as string,
    fullName: client.full_name,
    status: client.status,
  });

  const response = NextResponse.json(
    {
      fullName: client.full_name,
      status: client.status,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
  response.cookies.set(CLIENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CLIENT_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
