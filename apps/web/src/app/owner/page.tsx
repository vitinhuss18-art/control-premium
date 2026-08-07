"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

type Row = {
  tenant_id: string;
  company_name: string;
  tenant_status: "active" | "suspended" | "archived";
  admin_full_name: string | null;
  admin_email: string | null;
  plan_name: string | null;
  price_cents: number | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  client_count: number;
  active_loans_count: number;
  total_principal_lent_cents: number;
  overdue_installments_count: number;
  overdue_amount_cents: number;
  tenant_created_at: string;
};

const TRIAL_ALERT_DAYS = 3;

const formatMoney = (cents: number | null) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "—";

const statusLabel: Record<string, string> = {
  trialing: "Em teste",
  active: "Ativo",
  past_due: "Pagamento pendente",
  cancelled: "Cancelado",
  expired: "Expirado",
};

const tenantStatusLabel: Record<Row["tenant_status"], string> = {
  active: "Ativo",
  suspended: "Suspenso",
  archived: "Arquivado",
};

function trialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const diffMs = new Date(trialEndsAt).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function OwnerDashboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const supabase = useMemo<SupabaseClient | null>(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  async function carregar(client: SupabaseClient) {
    const { data, error: rpcError } = await client.rpc(
      "owner_dashboard_overview",
    );
    if (rpcError) {
      setError("Acesso negado ou erro ao carregar dados.");
      return;
    }
    setError(null);
    setRows((data ?? []) as Row[]);
  }

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        window.location.assign("/");
        return;
      }
      if (!cancelled) {
        await carregar(supabase);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const totals = useMemo(() => {
    if (!rows) return null;
    const activeCount = rows.filter(
      (row) => row.subscription_status === "active",
    ).length;
    const trialCount = rows.filter(
      (row) => row.subscription_status === "trialing",
    ).length;
    const trialEndingSoonCount = rows.filter((row) => {
      const daysLeft = trialDaysLeft(row.trial_ends_at);
      return (
        row.subscription_status === "trialing" &&
        daysLeft !== null &&
        daysLeft >= 0 &&
        daysLeft <= TRIAL_ALERT_DAYS
      );
    }).length;
    const trialExpiredCount = rows.filter((row) => {
      const daysLeft = trialDaysLeft(row.trial_ends_at);
      return (
        row.subscription_status === "trialing" &&
        daysLeft !== null &&
        daysLeft < 0
      );
    }).length;
    const suspendedCount = rows.filter(
      (row) => row.tenant_status === "suspended",
    ).length;
    const mrrCents = rows
      .filter((row) => row.subscription_status === "active")
      .reduce((sum, row) => sum + (row.price_cents ?? 0), 0);
    const totalClients = rows.reduce((sum, row) => sum + row.client_count, 0);
    const overdueInstallments = rows.reduce(
      (sum, row) => sum + row.overdue_installments_count,
      0,
    );
    const overdueAmountCents = rows.reduce(
      (sum, row) => sum + row.overdue_amount_cents,
      0,
    );
    return {
      total: rows.length,
      activeCount,
      trialCount,
      trialEndingSoonCount,
      trialExpiredCount,
      suspendedCount,
      mrrCents,
      totalClients,
      overdueInstallments,
      overdueAmountCents,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesTerm =
        !term ||
        row.company_name.toLowerCase().includes(term) ||
        (row.admin_full_name ?? "").toLowerCase().includes(term) ||
        (row.admin_email ?? "").toLowerCase().includes(term);
      const trialDays = trialDaysLeft(row.trial_ends_at);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "overdue"
          ? row.overdue_installments_count > 0
          : statusFilter === "trial_expired"
            ? row.subscription_status === "trialing" &&
              trialDays !== null &&
              trialDays < 0
            : statusFilter === "tenant_suspended"
              ? row.tenant_status === "suspended"
              : statusFilter === "tenant_archived"
                ? row.tenant_status === "archived"
                : row.subscription_status === statusFilter);
      return matchesTerm && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  async function alternarStatusTenant(row: Row) {
    if (!supabase) return;
    const novoStatus =
      row.tenant_status === "suspended" ? "active" : "suspended";
    const acao = novoStatus === "suspended" ? "suspender" : "reativar";
    if (
      !window.confirm(`Confirma ${acao} o acesso de "${row.company_name}"?`)
    ) {
      return;
    }
    let motivo: string | null = null;
    if (novoStatus === "suspended") {
      const resposta = window.prompt(
        `Informe o motivo da suspensão de "${row.company_name}" (obrigatório):`,
      );
      if (resposta === null) return;
      motivo = resposta.trim();
      if (!motivo) {
        setActionError("Informe o motivo da suspensão.");
        return;
      }
      if (motivo.length > 500) {
        setActionError(
          "O motivo da suspensão deve ter no máximo 500 caracteres.",
        );
        return;
      }
    }
    setActionError(null);
    setPendingTenantId(row.tenant_id);
    const { error: rpcError } = await supabase.rpc("owner_set_tenant_status", {
      p_tenant_id: row.tenant_id,
      p_status: novoStatus,
      p_note: motivo,
    });
    setPendingTenantId(null);
    if (rpcError) {
      setActionError(
        `Não foi possível ${acao} "${row.company_name}": ${rpcError.message}`,
      );
      return;
    }
    await carregar(supabase);
  }

  async function sair() {
    await supabase?.auth.signOut();
    window.location.assign("/");
  }

  return (
    <main className="owner-shell">
      <div className="owner-topbar">
        <span className="owner-brand">
          Control$ <b>Premium</b> · Painel do dono
        </span>
        <button className="owner-logout" onClick={sair}>
          Sair
        </button>
      </div>

      {!supabase && (
        <div className="owner-error">Configuração indisponível.</div>
      )}
      {error && <div className="owner-error">{error}</div>}
      {actionError && <div className="owner-error">{actionError}</div>}
      {supabase && !error && !rows && (
        <div className="owner-loading">Carregando assinantes...</div>
      )}

      {totals && (
        <div className="owner-kpis">
          <div className="owner-kpi">
            <span>Assinantes</span>
            <b>{totals.total}</b>
          </div>
          <div className="owner-kpi">
            <span>Ativos</span>
            <b>{totals.activeCount}</b>
          </div>
          <div className="owner-kpi">
            <span>Em teste</span>
            <b>{totals.trialCount}</b>
          </div>
          <div
            className={
              totals.trialEndingSoonCount > 0
                ? "owner-kpi owner-kpi-alert"
                : "owner-kpi"
            }
          >
            <span>Trial acabando (≤{TRIAL_ALERT_DAYS}d)</span>
            <b>{totals.trialEndingSoonCount}</b>
          </div>
          <div
            className={
              totals.trialExpiredCount > 0
                ? "owner-kpi owner-kpi-alert"
                : "owner-kpi"
            }
          >
            <span>Trials vencidos</span>
            <b>{totals.trialExpiredCount}</b>
          </div>
          <div
            className={
              totals.suspendedCount > 0
                ? "owner-kpi owner-kpi-alert"
                : "owner-kpi"
            }
          >
            <span>Suspensos</span>
            <b>{totals.suspendedCount}</b>
          </div>
          <div className="owner-kpi">
            <span>MRR estimado</span>
            <b>{formatMoney(totals.mrrCents)}</b>
          </div>
          <div className="owner-kpi">
            <span>Clientes (todos)</span>
            <b>{totals.totalClients}</b>
          </div>
          <div
            className={
              totals.overdueInstallments > 0
                ? "owner-kpi owner-kpi-alert"
                : "owner-kpi"
            }
          >
            <span>Parcelas em atraso</span>
            <b>{totals.overdueInstallments}</b>
          </div>
          <div
            className={
              totals.overdueAmountCents > 0
                ? "owner-kpi owner-kpi-alert"
                : "owner-kpi"
            }
          >
            <span>Valor em atraso</span>
            <b>{formatMoney(totals.overdueAmountCents)}</b>
          </div>
        </div>
      )}

      {rows && (
        <div className="owner-toolbar">
          <input
            className="owner-search"
            type="text"
            placeholder="Buscar por empresa, responsável ou e-mail..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="owner-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="trialing">Em teste</option>
            <option value="trial_expired">Trial vencido</option>
            <option value="active">Ativos</option>
            <option value="past_due">Pagamento pendente</option>
            <option value="cancelled">Cancelados</option>
            <option value="expired">Expirados</option>
            <option value="overdue">Com parcela em atraso</option>
            <option value="tenant_suspended">Acesso suspenso</option>
            <option value="tenant_archived">Acesso arquivado</option>
          </select>
        </div>
      )}

      {filteredRows && (
        <div className="owner-table-wrap">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Responsável</th>
                <th>E-mail</th>
                <th>Plano</th>
                <th>Assinatura</th>
                <th>Trial até</th>
                <th>Clientes</th>
                <th>Empréstimos ativos</th>
                <th>Carteira emprestada</th>
                <th>Em atraso</th>
                <th>Desde</th>
                <th>Acesso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const daysLeft = trialDaysLeft(row.trial_ends_at);
                const trialSoon =
                  row.subscription_status === "trialing" &&
                  daysLeft !== null &&
                  daysLeft >= 0 &&
                  daysLeft <= TRIAL_ALERT_DAYS;
                const trialExpired =
                  row.subscription_status === "trialing" &&
                  daysLeft !== null &&
                  daysLeft < 0;
                const hasOverdue = row.overdue_installments_count > 0;
                const rowClasses = [
                  row.tenant_status === "suspended"
                    ? "owner-row-suspended"
                    : "",
                  trialSoon || trialExpired || hasOverdue
                    ? "owner-row-alert"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr key={row.tenant_id} className={rowClasses || undefined}>
                    <td>{row.company_name}</td>
                    <td>{row.admin_full_name ?? "—"}</td>
                    <td>{row.admin_email ?? "—"}</td>
                    <td>{row.plan_name ?? "—"}</td>
                    <td>
                      <span
                        className={`owner-status owner-status-${
                          row.subscription_status ?? "none"
                        }`}
                      >
                        {row.subscription_status
                          ? (statusLabel[row.subscription_status] ??
                            row.subscription_status)
                          : "—"}
                      </span>
                      {(trialSoon || trialExpired) && (
                        <div className="owner-row-note">
                          {!trialExpired && daysLeft !== null
                            ? `vence em ${daysLeft} dia(s)`
                            : "trial vencido"}
                        </div>
                      )}
                    </td>
                    <td>{formatDate(row.trial_ends_at)}</td>
                    <td>{row.client_count}</td>
                    <td>
                      {row.active_loans_count > 0 ? (
                        row.active_loans_count
                      ) : (
                        <span className="owner-neutral-count">0</span>
                      )}
                    </td>
                    <td>{formatMoney(row.total_principal_lent_cents)}</td>
                    <td>
                      {hasOverdue ? (
                        <span className="owner-overdue">
                          {row.overdue_installments_count} ·{" "}
                          {formatMoney(row.overdue_amount_cents)}
                        </span>
                      ) : (
                        <span className="owner-neutral-count">—</span>
                      )}
                    </td>
                    <td>{formatDate(row.tenant_created_at)}</td>
                    <td>
                      <span
                        className={`owner-tenant-status owner-tenant-status-${row.tenant_status}`}
                      >
                        {tenantStatusLabel[row.tenant_status] ??
                          row.tenant_status}
                      </span>
                    </td>
                    <td>
                      {row.tenant_status !== "archived" && (
                        <button
                          className={
                            row.tenant_status === "suspended"
                              ? "owner-action-btn owner-action-btn-positive"
                              : "owner-action-btn owner-action-btn-danger"
                          }
                          disabled={pendingTenantId === row.tenant_id}
                          onClick={() => alternarStatusTenant(row)}
                        >
                          {pendingTenantId === row.tenant_id
                            ? "..."
                            : row.tenant_status === "suspended"
                              ? "Reativar"
                              : "Suspender"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="owner-empty">
                    {rows && rows.length > 0
                      ? "Nenhum assinante corresponde à busca/filtro."
                      : "Nenhum assinante ainda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
