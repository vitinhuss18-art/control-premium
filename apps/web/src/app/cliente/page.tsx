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
          data?.loans.map((loan) => (
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

              <div className="loan-card__installments">
                {loan.installments.map((installment) => (
                  <div
                    key={installment.sequenceNumber}
                    className="installment-row"
                  >
                    <span>
                      Parcela {installment.sequenceNumber} ·{" "}
                      {formatDate(installment.dueDate)}
                    </span>
                    <span>{formatCents(installment.totalCents)}</span>
                    <span
                      className={`installment-row__status${
                        installment.status === "paid"
                          ? " installment-row__status--paid"
                          : ""
                      }${
                        installment.status === "overdue"
                          ? " installment-row__status--overdue"
                          : ""
                      }`}
                    >
                      {INSTALLMENT_STATUS_LABEL[installment.status] ??
                        installment.status}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
      </div>
    </main>
  );
}
