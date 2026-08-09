"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";

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

type Plan = {
  plan_id: string;
  code: string;
  name: string;
  active: boolean;
  price_cents: number;
  currency: string;
  billing_interval: "monthly" | "yearly";
};

type SubscriptionStatus =
  "trialing" | "active" | "past_due" | "cancelled" | "expired";

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

const subscriptionStatuses: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
];

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [managedRow, setManagedRow] = useState<Row | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedSubscriptionStatus, setSelectedSubscriptionStatus] =
    useState<SubscriptionStatus>("trialing");
  const [freeDays, setFreeDays] = useState("7");
  const [managementNote, setManagementNote] = useState("");
  const [pendingManagementAction, setPendingManagementAction] = useState<
    "subscription" | "free_days" | null
  >(null);
  const managementNoteRef = useRef<HTMLTextAreaElement | null>(null);

  const supabase = useMemo<SupabaseClient | null>(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  async function carregar(client: SupabaseClient) {
    const [overviewResult, plansResult] = await Promise.all([
      client.rpc("owner_dashboard_overview"),
      client.rpc("owner_list_plans"),
    ]);
    if (overviewResult.error || plansResult.error) {
      setError("Acesso negado ou erro ao carregar dados.");
      return;
    }
    setError(null);
    setRows((overviewResult.data ?? []) as Row[]);
    setPlans((plansResult.data ?? []) as Plan[]);
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

  function abrirGerenciamento(row: Row) {
    const currentPlan = plans.find((plan) => plan.name === row.plan_name);
    const fallbackPlan = plans.find((plan) => plan.active);
    const currentStatus = row.subscription_status as SubscriptionStatus | null;

    setManagedRow(row);
    setSelectedPlanId(currentPlan?.plan_id ?? fallbackPlan?.plan_id ?? "");
    setSelectedSubscriptionStatus(
      currentStatus && subscriptionStatuses.includes(currentStatus)
        ? currentStatus
        : "trialing",
    );
    setFreeDays("7");
    setManagementNote("");
    setActionError(null);
    setActionSuccess(null);
  }

  function motivoValido(): string | null {
    const note = managementNote.trim();
    if (!note) {
      setActionError("Informe o motivo da alteração.");
      requestAnimationFrame(() => managementNoteRef.current?.focus());
      return null;
    }
    if (note.length > 500) {
      setActionError("O motivo deve ter no máximo 500 caracteres.");
      return null;
    }
    return note;
  }

  async function salvarAssinatura() {
    if (!supabase || !managedRow || !selectedPlanId) return;
    const note = motivoValido();
    if (!note) return;
    const plan = plans.find((item) => item.plan_id === selectedPlanId);
    if (
      !window.confirm(
        `Aplicar o plano "${plan?.name ?? "selecionado"}" com status "${statusLabel[selectedSubscriptionStatus]}" para "${managedRow.company_name}"?`,
      )
    ) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setPendingManagementAction("subscription");
    const { error: rpcError } = await supabase.rpc(
      "owner_update_subscription",
      {
        p_tenant_id: managedRow.tenant_id,
        p_plan_id: selectedPlanId,
        p_status: selectedSubscriptionStatus,
        p_note: note,
      },
    );
    setPendingManagementAction(null);
    if (rpcError) {
      setActionError(
        `Não foi possível alterar a assinatura: ${rpcError.message}`,
      );
      return;
    }

    const companyName = managedRow.company_name;
    setManagedRow(null);
    setActionSuccess(`Plano e status de "${companyName}" atualizados.`);
    await carregar(supabase);
  }

  async function concederDiasGratis() {
    if (!supabase || !managedRow) return;
    const days = Number(freeDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setActionError("Informe entre 1 e 3650 dias grátis.");
      return;
    }
    const note = motivoValido();
    if (!note) return;
    if (
      !window.confirm(
        `Conceder ${days} dia(s) grátis para "${managedRow.company_name}"?`,
      )
    ) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setPendingManagementAction("free_days");
    const { data, error: rpcError } = await supabase.rpc(
      "owner_grant_free_days",
      {
        p_tenant_id: managedRow.tenant_id,
        p_days: days,
        p_note: note,
      },
    );
    setPendingManagementAction(null);
    if (rpcError) {
      setActionError(`Não foi possível conceder os dias: ${rpcError.message}`);
      return;
    }

    const companyName = managedRow.company_name;
    const newEndDate = typeof data === "string" ? formatDate(data) : null;
    setManagedRow(null);
    setActionSuccess(
      `${days} dia(s) grátis concedidos para "${companyName}"${
        newEndDate ? `, até ${newEndDate}` : ""
      }.`,
    );
    await carregar(supabase);
  }

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
    setActionSuccess(null);
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
        <button className="owner-logout" type="button" onClick={sair}>
          Sair
        </button>
      </div>

      {!supabase && (
        <div className="owner-error">Configuração indisponível.</div>
      )}
      {error && <div className="owner-error">{error}</div>}
      {actionError && !managedRow && (
        <div className="owner-error" role="alert">
          {actionError}
        </div>
      )}
      {actionSuccess && <div className="owner-success">{actionSuccess}</div>}
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
                    <td>
                      <button
                        className="owner-company-button"
                        type="button"
                        onClick={() => abrirGerenciamento(row)}
                      >
                        {row.company_name}
                      </button>
                    </td>
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
                      <div className="owner-action-stack">
                        <button
                          className="owner-action-btn owner-action-btn-primary"
                          type="button"
                          disabled={pendingTenantId === row.tenant_id}
                          onClick={() => abrirGerenciamento(row)}
                        >
                          Gerenciar
                        </button>
                        {row.tenant_status !== "archived" && (
                          <button
                            className={
                              row.tenant_status === "suspended"
                                ? "owner-action-btn owner-action-btn-positive"
                                : "owner-action-btn owner-action-btn-danger"
                            }
                            type="button"
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
                      </div>
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

      {filteredRows && (
        <div className="owner-cards">
          {filteredRows.map((row) => {
            const daysLeft = trialDaysLeft(row.trial_ends_at);
            const trialExpired =
              row.subscription_status === "trialing" &&
              daysLeft !== null &&
              daysLeft < 0;
            const hasOverdue = row.overdue_installments_count > 0;

            return (
              <article
                key={row.tenant_id}
                className={
                  row.tenant_status === "suspended"
                    ? "owner-card owner-card-suspended"
                    : "owner-card"
                }
              >
                <div className="owner-card-header">
                  <button
                    className="owner-company-button owner-company-button-card"
                    type="button"
                    onClick={() => abrirGerenciamento(row)}
                  >
                    {row.company_name}
                  </button>
                  <span
                    className={`owner-tenant-status owner-tenant-status-${row.tenant_status}`}
                  >
                    {tenantStatusLabel[row.tenant_status] ?? row.tenant_status}
                  </span>
                </div>

                <div className="owner-card-summary">
                  <span>
                    Plano <b>{row.plan_name ?? "Sem plano"}</b>
                  </span>
                  <span>
                    Assinatura{" "}
                    <b>
                      {row.subscription_status
                        ? (statusLabel[row.subscription_status] ??
                          row.subscription_status)
                        : "Sem assinatura"}
                    </b>
                  </span>
                  <span>
                    Clientes <b>{row.client_count}</b>
                  </span>
                  <span>
                    Em atraso{" "}
                    <b className={hasOverdue ? "owner-overdue" : undefined}>
                      {hasOverdue
                        ? `${row.overdue_installments_count} · ${formatMoney(row.overdue_amount_cents)}`
                        : "Nenhum"}
                    </b>
                  </span>
                </div>

                {(trialExpired ||
                  (row.subscription_status === "trialing" &&
                    daysLeft !== null)) && (
                  <p className="owner-card-note">
                    {trialExpired
                      ? "Período grátis vencido"
                      : `Período grátis: ${daysLeft} dia(s) restante(s)`}
                  </p>
                )}

                <div className="owner-card-actions">
                  <button
                    className="owner-action-btn owner-action-btn-primary"
                    type="button"
                    disabled={pendingTenantId === row.tenant_id}
                    onClick={() => abrirGerenciamento(row)}
                  >
                    Gerenciar plano e cortesia
                  </button>
                  {row.tenant_status !== "archived" && (
                    <button
                      className={
                        row.tenant_status === "suspended"
                          ? "owner-action-btn owner-action-btn-positive"
                          : "owner-action-btn owner-action-btn-danger"
                      }
                      type="button"
                      disabled={pendingTenantId === row.tenant_id}
                      onClick={() => alternarStatusTenant(row)}
                    >
                      {pendingTenantId === row.tenant_id
                        ? "Processando..."
                        : row.tenant_status === "suspended"
                          ? "Reativar acesso"
                          : "Suspender acesso"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {filteredRows.length === 0 && (
            <div className="owner-empty owner-card-empty">
              {rows && rows.length > 0
                ? "Nenhum assinante corresponde à busca/filtro."
                : "Nenhum assinante ainda."}
            </div>
          )}
        </div>
      )}

      {managedRow && (
        <div className="owner-modal-backdrop" role="presentation">
          <section
            className="owner-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-management-title"
          >
            <div className="owner-modal-header">
              <div>
                <span>Controle do assinante</span>
                <h2 id="owner-management-title">{managedRow.company_name}</h2>
              </div>
              <button
                className="owner-modal-close"
                type="button"
                aria-label="Fechar"
                disabled={pendingManagementAction !== null}
                onClick={() => setManagedRow(null)}
              >
                ×
              </button>
            </div>

            <div className="owner-management-current">
              <span>
                Plano atual: <b>{managedRow.plan_name ?? "Sem plano"}</b>
              </span>
              <span>
                Status:{" "}
                <b>
                  {managedRow.subscription_status
                    ? (statusLabel[managedRow.subscription_status] ??
                      managedRow.subscription_status)
                    : "Sem assinatura"}
                </b>
              </span>
              <span>
                Dias grátis até: <b>{formatDate(managedRow.trial_ends_at)}</b>
              </span>
            </div>

            {actionError && (
              <div className="owner-error owner-modal-feedback" role="alert">
                {actionError}
              </div>
            )}

            <label className="owner-management-note">
              Motivo da alteração (obrigatório)
              <textarea
                ref={managementNoteRef}
                maxLength={500}
                rows={3}
                placeholder="Ex.: cortesia comercial autorizada"
                value={managementNote}
                aria-invalid={Boolean(actionError && !managementNote.trim())}
                onChange={(event) => {
                  setManagementNote(event.target.value);
                  if (actionError) setActionError(null);
                }}
              />
              <span>{managementNote.length}/500</span>
            </label>

            <div className="owner-management-section">
              <h3>Plano e status</h3>
              <div className="owner-management-grid">
                <label>
                  Plano
                  <select
                    value={selectedPlanId}
                    onChange={(event) => setSelectedPlanId(event.target.value)}
                  >
                    {plans
                      .filter((plan) => plan.active)
                      .map((plan) => (
                        <option key={plan.plan_id} value={plan.plan_id}>
                          {plan.name} · {formatMoney(plan.price_cents)} /{" "}
                          {plan.billing_interval === "yearly" ? "ano" : "mês"}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Status da assinatura
                  <select
                    value={selectedSubscriptionStatus}
                    onChange={(event) =>
                      setSelectedSubscriptionStatus(
                        event.target.value as SubscriptionStatus,
                      )
                    }
                  >
                    {subscriptionStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="owner-management-submit"
                type="button"
                disabled={pendingManagementAction !== null || !selectedPlanId}
                onClick={salvarAssinatura}
              >
                {pendingManagementAction === "subscription"
                  ? "Salvando..."
                  : "Aplicar plano e status"}
              </button>
            </div>

            <div className="owner-management-section owner-management-section-highlight">
              <h3>Conceder dias grátis</h3>
              <p>
                Os dias são somados ao período grátis ainda válido. A assinatura
                passa para “Em teste”.
              </p>
              <div className="owner-free-days-row">
                {[7, 15, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={freeDays === String(days) ? "active" : undefined}
                    onClick={() => setFreeDays(String(days))}
                  >
                    +{days} dias
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="3650"
                  step="1"
                  aria-label="Quantidade personalizada de dias grátis"
                  value={freeDays}
                  onChange={(event) => setFreeDays(event.target.value)}
                />
              </div>
              <button
                className="owner-management-submit owner-management-submit-gold"
                type="button"
                disabled={pendingManagementAction !== null}
                onClick={concederDiasGratis}
              >
                {pendingManagementAction === "free_days"
                  ? "Concedendo..."
                  : "Conceder dias grátis"}
              </button>
            </div>

            <p className="owner-management-audit">
              Todas as ações ficam registradas na auditoria com usuário, data,
              valores anteriores e novos.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
