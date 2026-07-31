"use client";

import { useEffect, useState } from "react";

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
  status: string;
  principalCents: number;
  contractedTotalCents: number;
  outstandingCents: number;
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
function whatsappLink(rawNumber: string | null, message: string): string | null {
  if (!rawNumber) return null;
  const digits = rawNumber.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
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
            return (
            <article key={loan.loanId} className="loan-card">
              <div className="loan-card__top">
                <strong>
                  Empréstimo{" "}
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
                  <span>Valor contratado</span>
                  <strong>{formatCents(loan.contractedTotalCents)}</strong>
                </div>
                <div>
                  <span>Saldo em aberto</span>
                  <strong>{formatCents(loan.outstandingCents)}</strong>
                </div>
              </div>

              {loan.outstandingCents > 0 &&
                loan.status !== "cancelled" &&
                loan.status !== "settled" &&
                (() => {
                  const link = whatsappLink(
                    tenantWhatsapp,
                    `Oi! Quero quitar meu empréstimo. Saldo em aberto: ${formatCents(
                      loan.outstandingCents,
                    )}.`,
                  );
                  return link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="client-portal__pay-button"
                    >
                      💰 Quitar dívida ({formatCents(loan.outstandingCents)})
                    </a>
                  ) : (
                    <p className="client-portal__state">
                      Pra quitar ou pagar, fale diretamente com{" "}
                      {tenantName ?? "quem te emprestou"}.
                    </p>
                  );
                })()}

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
