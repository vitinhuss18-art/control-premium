import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const genericError =
  "CPF ou senha inválidos. Confirme também o e-mail cadastrado.";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json(
      { message: "Login indisponível no momento." },
      { status: 503 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    cpf?: unknown;
    password?: unknown;
  } | null;
  const cpf = typeof body?.cpf === "string" ? body.cpf.replace(/\D/g, "") : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (cpf.length !== 11 || password.length < 8) {
    return NextResponse.json({ message: genericError }, { status: 401 });
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const { data: rateLimit, error: rateLimitError } = await service.rpc(
    "consume_login_rate_limit",
    {
      p_scope: "subscriber",
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

  const { data: profiles } = await service
    .from("profiles")
    .select("id, role")
    .eq("cpf", cpf)
    .in("role", ["admin", "super_admin"])
    .eq("active", true)
    .limit(2);
  if (profiles?.length !== 1 || !profiles[0]?.id) {
    return NextResponse.json({ message: genericError }, { status: 401 });
  }
  const { data: result } = await service.auth.admin.getUserById(profiles[0].id);
  const email = result.user?.email;
  if (!email) {
    return NextResponse.json({ message: genericError }, { status: 401 });
  }

  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    return NextResponse.json({ message: genericError }, { status: 401 });
  }
  await service.rpc("reset_login_rate_limit", {
    p_scope: "subscriber",
    p_identity: `${cpf}:${ip ?? "unknown"}`,
  });
  return NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    role: profiles[0].role,
  });
}
