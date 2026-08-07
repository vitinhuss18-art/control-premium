begin;

-- As RPCs publicas ficam como SECURITY INVOKER. A implementacao que precisa
-- atravessar a RLS vive no schema private, fora da Data API, e ainda exige
-- explicitamente o papel super_admin antes de consultar ou alterar dados.
create schema if not exists private;

revoke all on schema private from public, anon, service_role;
grant usage on schema private to authenticated;

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
    select tenant_id, count(*) as client_count
    from public.clients
    group by tenant_id
  ) c on c.tenant_id = t.id
  left join (
    select
      tenant_id,
      count(*) filter (where status = 'active') as active_loans_count,
      sum(principal_cents) filter (where status <> 'cancelled') as total_principal_lent_cents
    from public.loans
    group by tenant_id
  ) l on l.tenant_id = t.id
  left join (
    select
      tenant_id,
      count(*) as overdue_installments_count,
      sum(total_cents - paid_cents) as overdue_amount_cents
    from public.installments
    where due_date < current_date
      and status <> 'cancelled'
      and paid_cents < total_cents
    group by tenant_id
  ) i on i.tenant_id = t.id
  order by t.created_at desc;
end;
$$;

revoke all on function private.owner_dashboard_overview_impl()
  from public, anon, service_role;
grant execute on function private.owner_dashboard_overview_impl()
  to authenticated;

create or replace function public.owner_dashboard_overview()
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
language sql
security invoker
set search_path = ''
as $$
  select * from private.owner_dashboard_overview_impl()
$$;

revoke all on function public.owner_dashboard_overview()
  from public, anon, service_role;
grant execute on function public.owner_dashboard_overview()
  to authenticated;

create or replace function private.owner_set_tenant_status_impl(
  p_tenant_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  if p_status not in ('active', 'suspended') then
    raise exception 'Status invalido para essa acao';
  end if;

  if p_status = 'suspended' and v_note is null then
    raise exception 'Informe o motivo da suspensao';
  end if;

  if char_length(v_note) > 500 then
    raise exception 'O motivo deve ter no maximo 500 caracteres';
  end if;

  select status into v_previous_status
  from public.tenants
  where id = p_tenant_id
  for update;

  if v_previous_status is null then
    raise exception 'Assinante nao encontrado';
  end if;

  if v_previous_status = p_status then
    return;
  end if;

  update public.tenants
  set status = p_status,
      updated_at = now()
  where id = p_tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    p_tenant_id,
    auth.uid(),
    'owner.tenant_status_changed',
    'tenant',
    p_tenant_id::text,
    jsonb_build_object(
      'previous_status', v_previous_status,
      'new_status', p_status,
      'note', v_note
    )
  );
end;
$$;

revoke all on function private.owner_set_tenant_status_impl(uuid, text, text)
  from public, anon, service_role;
grant execute on function private.owner_set_tenant_status_impl(uuid, text, text)
  to authenticated;

create or replace function public.owner_set_tenant_status(
  p_tenant_id uuid,
  p_status text,
  p_note text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.owner_set_tenant_status_impl(p_tenant_id, p_status, p_note)
$$;

revoke all on function public.owner_set_tenant_status(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.owner_set_tenant_status(uuid, text, text)
  to authenticated;

commit;
