import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

const genericError = "Código inválido.";

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerCode = process.env.OWNER_ACCESS_CODE;
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceKey ||
    !ownerCode ||
    !ownerEmail ||
    !ownerPassword
  ) {
    return NextResponse.json(
      { message: "Acesso administrativo indisponível no momento." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
  } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code) {
    return NextResponse.json({ message: genericError }, { status: 401 });
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const { data: rateLimit, error: rateLimitError } = await service.rpc(
    "consume_login_rate_limit",
    {
      p_scope: "owner",
      p_identity: ip ?? "unknown",
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

  if (!safeEqual(code, ownerCode)) {
    return NextResponse.json({ message: genericError }, { status: 401 });
  }

  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  if (error || !data.session) {
    return NextResponse.json(
      { message: "Acesso administrativo indisponível no momento." },
      { status: 503 },
    );
  }

  await service.rpc("reset_login_rate_limit", {
    p_scope: "owner",
    p_identity: ip ?? "unknown",
  });

  return NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
}
