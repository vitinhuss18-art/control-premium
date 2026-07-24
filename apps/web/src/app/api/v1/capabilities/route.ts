import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      apiVersion: "v1",
      currency: "BRL",
      moneyRepresentation: "integer_cents",
      features: {
        clients: true,
        proposals: true,
        loans: true,
        contracts: true,
        pix: Boolean(process.env.PIX_PROVIDER),
        whatsapp: Boolean(process.env.WHATSAPP_PROVIDER),
        aiAssistance: Boolean(process.env.AI_PROVIDER),
      },
      safety: {
        humanCreditDecisionRequired: true,
        idempotencyRequiredForFinancialMutations: true,
        tenantIsolationRequired: true,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}
