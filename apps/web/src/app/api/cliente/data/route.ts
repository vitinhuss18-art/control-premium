import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import {
  CLIENT_SESSION_COOKIE,
  verifyClientSessionToken,
} from "@/lib/clientSession";

type InstallmentRow = {
  sequence_number: number;
  due_date: string;
  total_cents: number;
  paid_cents: number;
  status: string;
};

type LoanRow = {
  id: string;
  status: string;
  principal_cents: number;
  created_at: string;
  installments: InstallmentRow[];
};

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { message: "Serviço indisponível." },
      { status: 503 },
    );
  }

  const session = verifyClientSessionToken(
    request.cookies.get(CLIENT_SESSION_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: loans, error } = await service
    .from("loans")
    .select(
      "id, status, principal_cents, created_at, installments!installments_loan_id_fkey(sequence_number, due_date, total_cents, paid_cents, status)",
    )
    .eq("tenant_id", session.tenantId)
    .eq("client_id", session.clientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("cliente/data loans query failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return NextResponse.json(
      { message: "Não foi possível carregar seus dados agora." },
      { status: 500 },
    );
  }

  const loanRows = (loans ?? []) as unknown as LoanRow[];

  const shaped = loanRows.map((loan) => {
    const installments = [...(loan.installments ?? [])].sort(
      (a, b) => a.sequence_number - b.sequence_number,
    );
    const contractedTotalCents = installments.reduce(
      (sum, item) => sum + item.total_cents,
      0,
    );
    const outstandingCents = installments.reduce((sum, item) => {
      if (item.status === "cancelled") return sum;
      return sum + Math.max(0, item.total_cents - item.paid_cents);
    }, 0);
    return {
      loanId: loan.id,
      status: loan.status,
      principalCents: loan.principal_cents,
      contractedTotalCents,
      outstandingCents,
      createdAt: loan.created_at,
      installments: installments.map((item) => ({
        sequenceNumber: item.sequence_number,
        dueDate: item.due_date,
        totalCents: item.total_cents,
        paidCents: item.paid_cents,
        status: item.status,
      })),
    };
  });

  const { data: tenant } = await service
    .from("tenants")
    .select("display_name, whatsapp_business_number")
    .eq("id", session.tenantId)
    .maybeSingle();

  return NextResponse.json(
    {
      fullName: session.fullName,
      status: session.status,
      loans: shaped,
      tenantName: tenant?.display_name ?? null,
      tenantWhatsapp: tenant?.whatsapp_business_number ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
