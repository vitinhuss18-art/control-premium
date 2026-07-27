"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

type Row = {
  tenant_id: string;
  company_name: string;
  admin_full_name: string | null;
  admin_email: string | null;
  plan_name: string | null;
  price_cents: number | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  client_count: number;
  tenant_created_at: string;
};

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

export default function OwnerDashboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

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
      const { data, error: rpcError } = await supabase.rpc(
        "owner_dashboard_overview",
      );
      if (cancelled) return;
      if (rpcError) {
        setError("Acesso negado ou erro ao carregar dados.");
        return;
      }
      setRows((data ?? []) as Row[]);
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
    const mrrCents = rows
      .filter((row) => row.subscription_status === "active")
      .reduce((sum, row) => sum + (row.price_cents ?? 0), 0);
    const totalClients = rows.reduce((sum, row) => sum + row.client_count, 0);
    return {
      total: rows.length,
      activeCount,
      trialCount,
      mrrCents,
      totalClients,
    };
  }, [rows]);

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
          <div className="owner-kpi">
            <span>MRR estimado</span>
            <b>{formatMoney(totals.mrrCents)}</b>
          </div>
          <div className="owner-kpi">
            <span>Clientes (todos)</span>
            <b>{totals.totalClients}</b>
          </div>
        </div>
      )}

      {rows && (
        <div className="owner-table-wrap">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Responsável</th>
                <th>E-mail</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Trial até</th>
                <th>Clientes</th>
                <th>Desde</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tenant_id}>
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
                  </td>
                  <td>{formatDate(row.trial_ends_at)}</td>
                  <td>{row.client_count}</td>
                  <td>{formatDate(row.tenant_created_at)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="owner-empty">
                    Nenhum assinante ainda.
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
