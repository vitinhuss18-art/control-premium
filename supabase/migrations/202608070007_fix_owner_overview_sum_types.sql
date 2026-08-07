begin;

-- SUM(bigint) retorna numeric no PostgreSQL. Convertemos explicitamente as
-- duas somas para bigint, que e o contrato publico original da RPC.
create or replace function private.owner_dashboard_overview_impl()
returns table(
  tenant_id uuid,
  company_name text,
  tenant_status text,
  admin_full_name text,
  admin_email text,
  plan_name text,
  price_cents bigint,
  subscription_status text,
  trial_ends_at timestamptz,
  client_count bigint,
  active_loans_count bigint,
  total_principal_lent_cents bigint,
  overdue_installments_count bigint,
  overdue_amount_cents bigint,
  tenant_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  return query
  select
    t.id,
    t.display_name,
    t.status,
    p.full_name,
    u.email::text,
    sp.name,
    sp.price_cents,
    ts.status,
    ts.trial_ends_at,
    coalesce(c.client_count, 0),
    coalesce(l.active_loans_count, 0),
    coalesce(l.total_principal_lent_cents, 0),
    coalesce(i.overdue_installments_count, 0),
    coalesce(i.overdue_amount_cents, 0),
    t.created_at
  from public.tenants t
  left join public.profiles p on p.tenant_id = t.id and p.role = 'admin'
  left join auth.users u on u.id = p.id
  left join public.tenant_subscriptions ts on ts.tenant_id = t.id
  left join public.saas_plans sp on sp.id = ts.plan_id
  left join (
    select client.tenant_id, count(*) as client_count
    from public.clients client
    group by client.tenant_id
  ) c on c.tenant_id = t.id
  left join (
    select
      loan.tenant_id,
      count(*) filter (where loan.status = 'active') as active_loans_count,
      (sum(loan.principal_cents) filter (where loan.status <> 'cancelled'))::bigint
        as total_principal_lent_cents
    from public.loans loan
    group by loan.tenant_id
  ) l on l.tenant_id = t.id
  left join (
    select
      installment.tenant_id,
      count(*) as overdue_installments_count,
      sum(installment.total_cents - installment.paid_cents)::bigint
        as overdue_amount_cents
    from public.installments installment
    where installment.due_date < current_date
      and installment.status <> 'cancelled'
      and installment.paid_cents < installment.total_cents
    group by installment.tenant_id
  ) i on i.tenant_id = t.id
  order by t.created_at desc;
end;
$$;

revoke all on function private.owner_dashboard_overview_impl()
  from public, anon, service_role;
grant execute on function private.owner_dashboard_overview_impl()
  to authenticated;

commit;
