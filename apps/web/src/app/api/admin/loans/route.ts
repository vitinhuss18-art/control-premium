import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  simulateInstallmentSale,
  simulateProposal,
  ProposalValidationError,
  InstallmentSaleValidationError,
  type PaymentFrequency,
} from "@control-premium/domain";

type RequestBody = {
  clientId?: unknown;
  operationType?: unknown;
  frequency?: unknown;
  installmentCount?: unknown;
  periodicInterestBps?: unknown;
  firstDueDate?: unknown;
  purpose?: unknown;
  principalCents?: unknown;
  // apenas para venda parcelada
  productName?: unknown;
  productDescription?: unknown;
  productPhotoPath?: unknown;
  salePriceCents?: unknown;
  downPaymentCents?: unknown;
};

const validFrequencies: readonly PaymentFrequency[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
];

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : undefined;
}

// Esta rota existe porque o motor de calculo financeiro (juros, distribuicao
// justa de centavos, dias uteis/feriados) so existe testado em TypeScript
// (packages/domain). O index.html e HTML/JS solto sem build, entao nao
// consegue importar o pacote -- por isso o calculo acontece aqui (server-side,
// Next.js) e so o resultado ja pronto e enviado pro banco via RPC. Ver a
// migration 202607280001_create_loan.sql para o porque disso ser deliberado.
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { message: "Serviço indisponível." },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!accessToken) {
    return NextResponse.json(
      { message: "Faça login novamente." },
      { status: 401 },
    );
  }

  // cliente com o token do proprio admin -- a RPC roda com auth.uid() dele,
  // entao a checagem de permissao (proposals.approve) e feita pelo banco,
  // nao por essa rota.
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body) {
    return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });
  }

  const clientId = asString(body.clientId);
  const operationType =
    asString(body.operationType) === "installment_sale"
      ? "installment_sale"
      : "loan";
  const frequency = asString(body.frequency) as PaymentFrequency | undefined;
  const installmentCount = asInt(body.installmentCount);
  const periodicInterestBps = asInt(body.periodicInterestBps);
  const firstDueDate = asString(body.firstDueDate);
  const purpose = asString(body.purpose);

  if (
    !clientId ||
    !frequency ||
    !validFrequencies.includes(frequency) ||
    installmentCount === undefined ||
    periodicInterestBps === undefined ||
    !firstDueDate
  ) {
    return NextResponse.json(
      {
        message:
          "Preencha frequência, parcelas, juros e a primeira data de vencimento.",
      },
      { status: 400 },
    );
  }

  let simulation:
    | ReturnType<typeof simulateProposal>
    | ReturnType<typeof simulateInstallmentSale>;
  let principalCents: number;
  let productFields: Record<string, unknown> = {};

  try {
    if (operationType === "installment_sale") {
      const productName = asString(body.productName);
      const salePriceCents = asInt(body.salePriceCents);
      if (!productName || salePriceCents === undefined) {
        return NextResponse.json(
          {
            message: "Venda parcelada exige nome do produto e valor de venda.",
          },
          { status: 400 },
        );
      }
      const installmentSale = simulateInstallmentSale({
        productName,
        productDescription: asString(body.productDescription),
        productPhotoPath: asString(body.productPhotoPath),
        salePriceCents,
        downPaymentCents: asInt(body.downPaymentCents),
        installmentCount,
        periodicInterestBps,
        frequency,
        firstDueDate,
      });
      simulation = installmentSale;
      principalCents = installmentSale.financedCents;
      productFields = {
        p_product_name: installmentSale.productName,
        p_product_description: installmentSale.productDescription ?? null,
        p_product_photo_path: installmentSale.productPhotoPath ?? null,
        p_sale_price_cents: installmentSale.salePriceCents,
        p_down_payment_cents: installmentSale.downPaymentCents,
      };
    } else {
      const principalInput = asInt(body.principalCents);
      if (principalInput === undefined) {
        return NextResponse.json(
          { message: "Informe o valor do empréstimo." },
          { status: 400 },
        );
      }
      simulation = simulateProposal({
        principalCents: principalInput,
        installmentCount,
        periodicInterestBps,
        frequency,
        firstDueDate,
      });
      principalCents = principalInput;
    }
  } catch (error) {
    if (
      error instanceof ProposalValidationError ||
      error instanceof InstallmentSaleValidationError
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }

  const installmentsPayload = simulation.installments.map((item) => ({
    sequence_number: item.number,
    due_date: item.dueDate,
    amount_cents: item.amountCents,
  }));

  const { data, error } = await supabase.rpc("create_loan_with_installments", {
    p_client_id: clientId,
    p_frequency: frequency,
    p_installment_count: installmentCount,
    p_periodic_interest_bps: periodicInterestBps,
    p_principal_cents: principalCents,
    p_total_cents: simulation.totalCents,
    p_installments: installmentsPayload,
    p_operation_type: operationType,
    p_purpose: purpose ?? null,
    ...productFields,
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    loanId: row?.loan_id,
    proposalId: row?.proposal_id,
    totalCents: simulation.totalCents,
    installmentCount,
  });
}
