import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PREMIUM_PLAN_CODE = "premium";
export const MERCADO_PAGO_PROVIDER = "mercado_pago";

export class BillingRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BillingRequestError";
  }
}

export type SubscriberBillingContext = Readonly<{
  service: SupabaseClient;
  userId: string;
  tenantId: string;
  email: string;
}>;

function requiredServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new BillingRequestError("Serviço de cobrança indisponível.", 503);
  }
  return { supabaseUrl, serviceRoleKey };
}

export function createBillingServiceClient(): SupabaseClient {
  const { supabaseUrl, serviceRoleKey } = requiredServerConfig();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireSubscriberBillingContext(
  request: Request,
): Promise<SubscriberBillingContext> {
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) {
    throw new BillingRequestError("Faça login novamente.", 401);
  }

  const service = createBillingServiceClient();
  const { data: authData, error: authError } =
    await service.auth.getUser(accessToken);
  const user = authData.user;
  if (authError || !user?.id || !user.email) {
    throw new BillingRequestError("Sua sessão expirou. Entre novamente.", 401);
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("tenant_id, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile?.tenant_id ||
    profile.role !== "admin" ||
    profile.active !== true
  ) {
    throw new BillingRequestError(
      "Somente o administrador da empresa pode gerenciar a assinatura.",
      403,
    );
  }

  return {
    service,
    userId: user.id,
    tenantId: profile.tenant_id as string,
    email: user.email,
  };
}

export function getTrustedAppOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.hostname === "localhost") {
        return url.origin;
      }
    } catch {
      // A origem da própria requisição ainda é segura para instalações antigas.
    }
  }
  return new URL(request.url).origin;
}

export function billingErrorResponse(error: unknown): Response {
  if (error instanceof BillingRequestError) {
    return Response.json({ message: error.message }, { status: error.status });
  }
  console.error("Falha interna na cobrança do SaaS", error);
  return Response.json(
    { message: "Não foi possível iniciar a cobrança. Tente novamente." },
    { status: 500 },
  );
}
