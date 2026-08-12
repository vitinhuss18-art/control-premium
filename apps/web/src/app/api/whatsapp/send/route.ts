import { createHash } from "node:crypto";

import { getTrustedAppOrigin } from "@/lib/billingServer";
import {
  getEvolutionConnectionState,
  normalizeBrazilianWhatsApp,
  sendEvolutionText,
} from "@/lib/evolutionApi";
import {
  requireWhatsAppAdminContext,
  WhatsAppRequestError,
  whatsappErrorResponse,
} from "@/lib/whatsappServer";

type SendBody =
  | {
      kind?: unknown;
      recipient?: unknown;
      signupToken?: unknown;
    }
  | {
      kind?: unknown;
      proposalId?: unknown;
    };

type PreparedMessage = {
  recipient: string;
  message: string;
  clientId: string | null;
  templateKey: string;
  category: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function prepareSignupInvite(
  request: Request,
  body: Extract<SendBody, { recipient?: unknown }>,
): Promise<PreparedMessage> {
  const signupToken =
    typeof body.signupToken === "string" ? body.signupToken.trim() : "";
  if (!/^[0-9a-f]{48}$/.test(signupToken)) {
    throw new WhatsAppRequestError("Link de cadastro inválido.", 400);
  }
  const recipient = normalizeBrazilianWhatsApp(
    typeof body.recipient === "string" ? body.recipient : "",
  );
  const link = `${getTrustedAppOrigin(request)}/cadastro?token=${signupToken}`;
  return {
    recipient,
    message: `Olá! Segue o link seguro para enviar sua proposta e seus documentos: ${link}`,
    clientId: null,
    templateKey: "client_signup_link",
    category: "registration",
    idempotencyKey: `whatsapp:signup:${hash(`${signupToken}:${recipient}`)}`,
    payload: { purpose: "client_signup" },
  };
}

async function prepareProposalResult(
  request: Request,
  body: Extract<SendBody, { proposalId?: unknown }>,
  context: Awaited<ReturnType<typeof requireWhatsAppAdminContext>>,
): Promise<PreparedMessage> {
  const proposalId =
    typeof body.proposalId === "string" ? body.proposalId.trim() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      proposalId,
    )
  ) {
    throw new WhatsAppRequestError("Proposta inválida.", 400);
  }

  const { data: proposal, error } = await context.service
    .from("client_proposals")
    .select("full_name, whatsapp, status, client_id, reviewed_at")
    .eq("tenant_id", context.tenantId)
    .eq("id", proposalId)
    .maybeSingle();
  if (error) throw error;
  if (!proposal || !["approved", "rejected"].includes(proposal.status)) {
    throw new WhatsAppRequestError(
      "A proposta ainda não possui um resultado para enviar.",
      409,
    );
  }

  const recipient = normalizeBrazilianWhatsApp(proposal.whatsapp);
  const firstName = String(proposal.full_name).trim();
  const approved = proposal.status === "approved";
  let message: string;
  if (approved) {
    const last4 = recipient.slice(-4);
    message = `🎉 ${firstName}, sua proposta foi aprovada!\n\nAcesse ${getTrustedAppOrigin(request)} e entre com seu CPF e os 4 últimos dígitos do seu WhatsApp (${last4}).`;
  } else {
    const retryAt = new Date(proposal.reviewed_at ?? Date.now());
    retryAt.setDate(retryAt.getDate() + 7);
    message = `Oi ${firstName}, por enquanto sua proposta não foi aprovada.\n\nVocê poderá enviar uma nova proposta a partir de ${retryAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`;
  }

  return {
    recipient,
    message,
    clientId: proposal.client_id,
    templateKey: approved ? "proposal_approved" : "proposal_rejected",
    category: "registration",
    idempotencyKey: `whatsapp:proposal:${proposalId}:${proposal.status}`,
    payload: { proposal_id: proposalId, decision: proposal.status },
  };
}

export async function POST(request: Request) {
  try {
    const context = await requireWhatsAppAdminContext(request);
    const body = (await request.json().catch(() => null)) as SendBody | null;
    const kind = typeof body?.kind === "string" ? body.kind : "";
    let prepared: PreparedMessage;
    if (kind === "signup_invite") {
      prepared = await prepareSignupInvite(
        request,
        body as Extract<SendBody, { recipient?: unknown }>,
      );
    } else if (kind === "proposal_result") {
      prepared = await prepareProposalResult(
        request,
        body as Extract<SendBody, { proposalId?: unknown }>,
        context,
      );
    } else {
      throw new WhatsAppRequestError("Tipo de mensagem inválido.", 400);
    }

    const { data: connection, error: connectionError } = await context.service
      .from("tenant_whatsapp_connections")
      .select("instance_name, registered_number, connected_number, status")
      .eq("tenant_id", context.tenantId)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (
      !connection ||
      connection.status !== "open" ||
      connection.connected_number !== connection.registered_number
    ) {
      throw new WhatsAppRequestError(
        "Conecte e confirme o WhatsApp da empresa antes de enviar.",
        409,
      );
    }

    const providerState = await getEvolutionConnectionState(
      connection.instance_name,
    );
    if (providerState !== "open") {
      await context.service
        .from("tenant_whatsapp_connections")
        .update({
          status: providerState ?? "close",
          connected_number: null,
          connected_at: null,
          last_checked_at: new Date().toISOString(),
        })
        .eq("tenant_id", context.tenantId);
      throw new WhatsAppRequestError(
        "O WhatsApp da empresa está desconectado. Leia o QR Code novamente.",
        409,
      );
    }

    const { data: reserved, error: reserveError } = await context.service.rpc(
      "reserve_whatsapp_notification",
      {
        p_tenant_id: context.tenantId,
        p_client_id: prepared.clientId,
        p_recipient: `+${prepared.recipient}`,
        p_template_key: prepared.templateKey,
        p_payload: prepared.payload,
        p_idempotency_key: prepared.idempotencyKey,
        p_category: prepared.category,
      },
    );
    if (reserveError) {
      throw new WhatsAppRequestError(reserveError.message, 409);
    }
    const reservation = Array.isArray(reserved) ? reserved[0] : reserved;
    if (!reservation?.notification_id) {
      throw new Error("Reserva de mensagem não retornou identificação");
    }
    if (["sent", "delivered"].includes(reservation.notification_status)) {
      return Response.json({ sent: true, reused: true });
    }

    const { data: current, error: currentError } = await context.service
      .from("notifications")
      .select("attempts, status")
      .eq("id", reservation.notification_id)
      .eq("tenant_id", context.tenantId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current || current.attempts >= 3) {
      throw new WhatsAppRequestError(
        "A mensagem excedeu o limite de tentativas.",
        409,
      );
    }

    const nextAttempt = Number(current.attempts) + 1;
    const { data: claimed, error: claimError } = await context.service
      .from("notifications")
      .update({ attempts: nextAttempt })
      .eq("id", reservation.notification_id)
      .eq("tenant_id", context.tenantId)
      .eq("attempts", current.attempts)
      .in("status", ["queued", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      return Response.json({ sent: false, processing: true, reused: true });
    }

    try {
      const sent = await sendEvolutionText({
        instanceName: connection.instance_name,
        recipient: prepared.recipient,
        message: prepared.message,
      });
      const sentAt = new Date().toISOString();
      const { error: updateError } = await context.service
        .from("notifications")
        .update({
          status: "sent",
          provider_reference: sent.providerMessageId,
          sent_at: sentAt,
          last_error_code: null,
        })
        .eq("id", reservation.notification_id)
        .eq("tenant_id", context.tenantId);
      if (updateError) throw updateError;

      await context.service.from("audit_logs").insert({
        tenant_id: context.tenantId,
        actor_id: context.userId,
        action: "whatsapp.message_sent",
        entity_type: "notification",
        entity_id: reservation.notification_id,
        details: {
          template_key: prepared.templateKey,
          recipient_suffix: prepared.recipient.slice(-4),
        },
      });
      return Response.json({ sent: true, reused: false });
    } catch (providerError) {
      await context.service
        .from("notifications")
        .update({ status: "failed", last_error_code: "provider_error" })
        .eq("id", reservation.notification_id)
        .eq("tenant_id", context.tenantId);
      throw providerError;
    }
  } catch (error) {
    return whatsappErrorResponse(error);
  }
}
