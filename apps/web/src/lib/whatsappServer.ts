import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { EvolutionApiError } from "./evolutionApi";

export class WhatsAppRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WhatsAppRequestError";
  }
}

export type WhatsAppAdminContext = Readonly<{
  service: SupabaseClient;
  userId: string;
  tenantId: string;
}>;

function serviceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new WhatsAppRequestError("Serviço de WhatsApp indisponível.", 503);
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireWhatsAppAdminContext(
  request: Request,
): Promise<WhatsAppAdminContext> {
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) {
    throw new WhatsAppRequestError("Faça login novamente.", 401);
  }

  const service = serviceClient();
  const { data: authData, error: authError } =
    await service.auth.getUser(accessToken);
  if (authError || !authData.user?.id) {
    throw new WhatsAppRequestError("Sua sessão expirou. Entre novamente.", 401);
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("tenant_id, role, active")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (
    profileError ||
    !profile?.tenant_id ||
    profile.role !== "admin" ||
    profile.active !== true
  ) {
    throw new WhatsAppRequestError(
      "Somente o administrador da empresa pode conectar o WhatsApp.",
      403,
    );
  }

  return {
    service,
    userId: authData.user.id,
    tenantId: profile.tenant_id as string,
  };
}

export function whatsappErrorResponse(error: unknown): Response {
  if (
    error instanceof WhatsAppRequestError ||
    error instanceof EvolutionApiError
  ) {
    return Response.json({ message: error.message }, { status: error.status });
  }
  console.error("Falha interna na integração de WhatsApp", error);
  return Response.json(
    { message: "Não foi possível concluir a operação no WhatsApp." },
    { status: 500 },
  );
}
