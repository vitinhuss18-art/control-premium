"use client";

import { useEffect, useState, type ReactNode } from "react";

import "./cliente.css";

type Installment = {
  sequenceNumber: number;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  status: string;
};

type Loan = {
  loanId: string;
  operationType: "loan" | "installment_sale";
  status: string;
  principalCents: number;
  contractedTotalCents: number;
  outstandingCents: number;
  amortizationAvailable: boolean;
  createdAt: string;
  installments: Installment[];
};

type PortalData = {
  fullName: string;
  status: string;
  loans: Loan[];
  tenantName: string | null;
  tenantWhatsapp: string | null;
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

// Ainda não existe gateway de pagamento real conectado (PIX/cartão) -- ver
// HANDOFF.md. Enquanto isso não é decidido, a opção de "pagar" leva o
// cliente pro WhatsApp do assinante com a mensagem já pronta, em vez de
// deixar sem nenhuma ação possível na tela.
function whatsappLink(
  rawNumber: string | null,
  message: string,
): string | null {
  if (!rawNumber) return null;
  const digits = rawNumber.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

function PaymentAction({
  href,
  variant,
  children,
}: Readonly<{
  href: string | null;
  variant: "interest" | "payoff" | "amortize";
  children: ReactNode;
}>) {
  const className = `client-portal__action-button client-portal__action-button--${variant}`;
  if (!href) {
    return (
      <span
        className={`${className} client-portal__action-button--disabled`}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

const LOAN_STATUS_LABEL: Record<string, string> = {
  pending_contract: "Aguardando contrato",
  pending_disbursement: "Aguardando liberação",
  active: "Em andamento",
  settled: "Quitado",
  delinquent: "Em atraso",
  cancelled: "Cancelado",
};

const INSTALLMENT_STATUS_LABEL: Record<string, string> = {
  pending: "A vencer",
  partially_paid: "Pago parcial",
  paid: "Pago",
  overdue: "Atrasada",
  cancelled: "Cancelada",
};

export default function ClientPortalPage() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/cliente/data", {
          credentials: "include",
        });
        if (response.status === 401) {
          window.sessionStorage.removeItem("controlPremiumClient");
          window.location.assign("/");
          return;
        }
        if (!response.ok) {
          throw new Error("Não foi possível carregar seus dados agora.");
        }
        const body = (await response.json()) as PortalData;
        if (active) setData(body);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar seus dados agora.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/cliente/logout", { method: "POST" });
    } finally {
      window.sessionStorage.removeItem("controlPremiumClient");
      window.location.assign("/");
    }
  }

  const totalDueCents =
    data?.loans.reduce((sum, loan) => {
      if (loan.status === "cancelled" || loan.status === "settled") return sum;
      return sum + loan.outstandingCents;
    }, 0) ?? 0;
  const openLoanCount =
    data?.loans.filter(
      (loan) =>
        loan.outstandingCents > 0 &&
        loan.status !== "cancelled" &&
        loan.status !== "settled",
    ).length ?? 0;

  return (
    <main className="client-portal">
      <div className="client-portal__wrap">
        <header className="client-portal__header">
          <div className="client-portal__greeting">
            <h1>{data ? `Olá, ${data.fullName.split(" ")[0]}` : "Sua área"}</h1>
            <p>Acompanhe seus empréstimos e parcelas.</p>
          </div>
          <button
            type="button"
            className="client-portal__logout"
            onClick={handleLogout}
          >
            Sair
          </button>
        </header>

        {loading && <p className="client-portal__state">Carregando…</p>}

        {error && <p className="client-portal__error">{error}</p>}

        {!loading && !error && data && (
          <section className="client-dashboard" aria-label="Resumo financeiro">
            <span className="client-dashboard__label">Valor total devido</span>
            <strong className="client-dashboard__value">
              {formatCents(totalDueCents)}
            </strong>
            <span className="client-dashboard__meta">
              {openLoanCount === 1
                ? "1 empréstimo em aberto"
                : `${openLoanCount} empréstimos em aberto`}
            </span>
          </section>
        )}

        {!loading && !error && data && data.loans.length === 0 && (
          <div className="client-portal__empty">
            Você ainda não tem nenhum empréstimo cadastrado por aqui.
          </div>
        )}

        {!loading &&
          !error &&
          data?.loans.map((loan) => {
            const tenantWhatsapp = data.tenantWhatsapp;
            const tenantName = data.tenantName;
            const isOpen =
              loan.outstandingCents > 0 &&
              loan.status !== "cancelled" &&
              loan.status !== "settled";
            const interestLink =
              isOpen && loan.operationType === "loan"
                ? whatsappLink(
                    tenantWhatsapp,
                    `Oi! Quero pagar os juros do meu empréstimo. Saldo em aberto: ${formatCents(
                      loan.outstandingCents,
                    )}.`,
                  )
                : null;
            const payoffLink = isOpen
              ? whatsappLink(
                  tenantWhatsapp,
                  `Oi! Quero quitar meu empréstimo. Saldo em aberto: ${formatCents(
                    loan.outstandingCents,
                  )}.`,
                )
              : null;
            const amortizationLink = loan.amortizationAvailable
              ? whatsappLink(
                  tenantWhatsapp,
                  `Oi! Meu empréstimo está em dia e quero amortizar o saldo devedor de ${formatCents(
                    loan.outstandingCents,
                  )}.`,
                )
              : null;
            return (
              <article key={loan.loanId} className="loan-card">
                <div className="loan-card__top">
                  <strong>
                    {loan.operationType === "installment_sale"
                      ? "Venda parcelada"
                      : "Empréstimo"}{" "}
                    {new Date(loan.createdAt).toLocaleDateString("pt-BR")}
                  </strong>
                  <span
                    className={`loan-card__badge${
                      loan.status === "settled"
                        ? " loan-card__badge--settled"
                        : ""
                    }${
                      loan.status === "delinquent"
                        ? " loan-card__badge--delinquent"
                        : ""
                    }`}
                  >
                    {LOAN_STATUS_LABEL[loan.status] ?? loan.status}
                  </span>
                </div>

                <div className="loan-card__totals">
                  <div>
                    <span>Valor devido neste contrato</span>
                    <strong>{formatCents(loan.outstandingCents)}</strong>
                  </div>
                  <div>
                    <span>Valor contratado</span>
                    <strong>{formatCents(loan.contractedTotalCents)}</strong>
                  </div>
                </div>

                {isOpen && (
                  <div
                    className="loan-card__actions"
                    aria-label="Formas de pagamento"
                  >
                    {loan.operationType === "loan" && (
                      <PaymentAction href={interestLink} variant="interest">
                        Pagar juros
                      </PaymentAction>
                    )}
                    <PaymentAction href={payoffLink} variant="payoff">
                      {loan.operationType === "installment_sale"
                        ? "Quitar venda parcelada"
                        : "Quitar empréstimo"}
                    </PaymentAction>
                    {loan.amortizationAvailable && (
                      <PaymentAction href={amortizationLink} variant="amortize">
                        Amortizar empréstimo
                      </PaymentAction>
                    )}
                    {!tenantWhatsapp && (
                      <p className="loan-card__contact-note">
                        Para pagar, fale diretamente com{" "}
                        {tenantName ?? "quem te emprestou"}.
                      </p>
                    )}
                  </div>
                )}

                <div className="loan-card__installments">
                  {loan.installments.map((installment) => {
                    const emAberto =
                      installment.status !== "paid" &&
                      installment.status !== "cancelled";
                    const saldoParcela = Math.max(
                      0,
                      installment.totalCents - installment.paidCents,
                    );
                    const linkParcela = emAberto
                      ? whatsappLink(
                          tenantWhatsapp,
                          `Oi! Quero pagar a parcela ${
                            installment.sequenceNumber
                          } (vencimento ${formatDate(
                            installment.dueDate,
                          )}), valor ${formatCents(saldoParcela)}.`,
                        )
                      : null;
                    return (
                      <div
                        key={installment.sequenceNumber}
                        className="installment-row"
                      >
                        <span>
                          Parcela {installment.sequenceNumber} ·{" "}
                          {formatDate(installment.dueDate)}
                        </span>
                        <span>{formatCents(installment.totalCents)}</span>
                        {linkParcela ? (
                          <a
                            href={linkParcela}
                            target="_blank"
                            rel="noreferrer"
                            className={`installment-row__status installment-row__status--pay${
                              installment.status === "overdue"
                                ? " installment-row__status--overdue"
                                : ""
                            }`}
                          >
                            {installment.status === "overdue"
                              ? "⏰ Atrasada · Pagar"
                              : "Pagar"}
                          </a>
                        ) : (
                          <span
                            className={`installment-row__status${
                              installment.status === "paid"
                                ? " installment-row__status--paid"
                                : ""
                            }`}
                          >
                            {INSTALLMENT_STATUS_LABEL[installment.status] ??
                              installment.status}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
      </div>
    </main>
  );
}
