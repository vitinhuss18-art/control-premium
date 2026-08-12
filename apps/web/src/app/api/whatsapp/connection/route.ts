import {
  connectEvolutionInstance,
  ensureEvolutionInstance,
  getEvolutionConnectedNumber,
  getEvolutionConnectionState,
  instanceNameForTenant,
  isEvolutionConfigured,
  logoutEvolutionInstance,
  normalizeBrazilianWhatsApp,
} from "@/lib/evolutionApi";
import {
  requireWhatsAppAdminContext,
  WhatsAppRequestError,
  whatsappErrorResponse,
  type WhatsAppAdminContext,
} from "@/lib/whatsappServer";

type ConnectionRow = {
  instance_name: string;
  registered_number: string;
  connected_number: string | null;
  status: string;
  connected_at: string | null;
};

async function loadConnection(
  context: WhatsAppAdminContext,
): Promise<ConnectionRow | null> {
  const { data, error } = await context.service
    .from("tenant_whatsapp_connections")
    .select(
      "instance_name, registered_number, connected_number, status, connected_at",
    )
    .eq("tenant_id", context.tenantId)
    .maybeSingle();
  if (error) throw error;
  return data as ConnectionRow | null;
}

async function synchronizeOpenConnection(
  context: WhatsAppAdminContext,
  connection: ConnectionRow,
): Promise<{ status: "open" | "mismatch"; connectedNumber: string | null }> {
  const discovered = await getEvolutionConnectedNumber(
    connection.instance_name,
  );
  const connectedNumber = discovered ?? connection.connected_number;
  const verified = connectedNumber === connection.registered_number;
  const status = verified ? "open" : "mismatch";
  const now = new Date().toISOString();

  const { error } = await context.service
    .from("tenant_whatsapp_connections")
    .update({
      connected_number: connectedNumber,
      status,
      connected_at: verified ? (connection.connected_at ?? now) : null,
      disconnected_at: null,
      last_checked_at: now,
      last_error: verified
        ? null
        : connectedNumber
          ? "O número conectado não corresponde ao número cadastrado."
          : "Não foi possível confirmar o número conectado.",
    })
    .eq("tenant_id", context.tenantId);
  if (error) throw error;

  if (verified) {
    const { error: tenantError } = await context.service
      .from("tenants")
      .update({
        whatsapp_business_number: connectedNumber,
        whatsapp_connected_at: connection.connected_at ?? now,
      })
      .eq("id", context.tenantId);
    if (tenantError) throw tenantError;
  }

  return { status, connectedNumber };
}

export async function GET(request: Request) {
  try {
    const context = await requireWhatsAppAdminContext(request);
    const connection = await loadConnection(context);
    if (!isEvolutionConfigured()) {
      return Response.json({
        configured: false,
        status: "not_configured",
        registeredNumber: connection?.registered_number ?? null,
        connectedNumber: null,
      });
    }
    if (!connection) {
      return Response.json({
        configured: true,
        status: "disconnected",
        registeredNumber: null,
        connectedNumber: null,
      });
    }

    const providerState = await getEvolutionConnectionState(
      connection.instance_name,
    );
    if (providerState === "open") {
      const synced = await synchronizeOpenConnection(context, connection);
      return Response.json({
        configured: true,
        status: synced.status,
        registeredNumber: connection.registered_number,
        connectedNumber: synced.connectedNumber,
      });
    }

    const status = providerState ?? "close";
    const { error } = await context.service
      .from("tenant_whatsapp_connections")
      .update({
        status,
        connected_number: null,
        connected_at: null,
        last_checked_at: new Date().toISOString(),
      })
      .eq("tenant_id", context.tenantId);
    if (error) throw error;

    return Response.json({
      configured: true,
      status,
      registeredNumber: connection.registered_number,
      connectedNumber: null,
    });
  } catch (error) {
    return whatsappErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireWhatsAppAdminContext(request);
    const body = (await request.json().catch(() => null)) as {
      number?: unknown;
    } | null;
    const registeredNumber = normalizeBrazilianWhatsApp(
      typeof body?.number === "string" ? body.number : "",
    );
    const instanceName = instanceNameForTenant(context.tenantId);
    const existing = await loadConnection(context);
    if (
      existing?.status === "open" &&
      existing.registered_number !== registeredNumber
    ) {
      throw new WhatsAppRequestError(
        "Desconecte o número atual antes de conectar outro WhatsApp.",
        409,
      );
    }

    const { error: upsertError } = await context.service
      .from("tenant_whatsapp_connections")
      .upsert(
        {
          tenant_id: context.tenantId,
          provider: "evolution_api",
          instance_name: instanceName,
          registered_number: registeredNumber,
          status: "connecting",
          last_error: null,
          last_checked_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );
    if (upsertError) throw upsertError;

    const provider = await ensureEvolutionInstance(instanceName);
    if (provider.state === "open") {
      const synced = await synchronizeOpenConnection(context, {
        instance_name: instanceName,
        registered_number: registeredNumber,
        connected_number: existing?.connected_number ?? null,
        status: "open",
        connected_at: existing?.connected_at ?? null,
      });
      return Response.json({
        configured: true,
        status: synced.status,
        registeredNumber,
        connectedNumber: synced.connectedNumber,
        qrCode: null,
      });
    }

    const result = provider.qrCode
      ? provider
      : await connectEvolutionInstance(instanceName);
    const { error: updateError } = await context.service
      .from("tenant_whatsapp_connections")
      .update({
        status: result.state,
        last_checked_at: new Date().toISOString(),
      })
      .eq("tenant_id", context.tenantId);
    if (updateError) throw updateError;

    return Response.json({
      configured: true,
      status: result.state,
      registeredNumber,
      connectedNumber: null,
      qrCode: result.qrCode,
    });
  } catch (error) {
    return whatsappErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireWhatsAppAdminContext(request);
    const connection = await loadConnection(context);
    if (!connection) return Response.json({ disconnected: true });

    try {
      await logoutEvolutionInstance(connection.instance_name);
    } catch (error) {
      if (!(
        error instanceof Error &&
        /not found|does not exist/i.test(error.message)
      )) {
        throw error;
      }
    }

    const now = new Date().toISOString();
    const { error } = await context.service
      .from("tenant_whatsapp_connections")
      .update({
        status: "close",
        connected_number: null,
        connected_at: null,
        disconnected_at: now,
        last_checked_at: now,
        last_error: null,
      })
      .eq("tenant_id", context.tenantId);
    if (error) throw error;

    const { error: tenantError } = await context.service
      .from("tenants")
      .update({ whatsapp_connected_at: null })
      .eq("id", context.tenantId);
    if (tenantError) throw tenantError;

    return Response.json({ disconnected: true });
  } catch (error) {
    return whatsappErrorResponse(error);
  }
}
