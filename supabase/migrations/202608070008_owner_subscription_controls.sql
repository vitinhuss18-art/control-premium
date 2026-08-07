begin;

-- O painel do dono consulta o catalogo e altera assinaturas somente por RPC.
-- A implementacao privilegiada permanece fora do schema exposto pela Data API.
create or replace function private.owner_list_plans_impl()
returns table(
  plan_id uuid,
  code text,
  name text,
  active boolean,
  price_cents bigint,
  currency text,
  billing_interval text
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
    plan.id,
    plan.code,
    plan.name,
    plan.active,
    plan.price_cents,
    plan.currency::text,
    plan.billing_interval
  from public.saas_plans plan
  order by plan.active desc, plan.price_cents, plan.name;
end;
$$;

revoke all on function private.owner_list_plans_impl()
  from public, anon, service_role;
grant execute on function private.owner_list_plans_impl()
  to authenticated;

create or replace function public.owner_list_plans()
returns table(
  plan_id uuid,
  code text,
  name text,
  active boolean,
  price_cents bigint,
  currency text,
  billing_interval text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.owner_list_plans_impl()
$$;

revoke all on function public.owner_list_plans()
  from public, anon, service_role;
grant execute on function public.owner_list_plans()
  to authenticated;

create or replace function private.owner_update_subscription_impl(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_status text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(p_note), '');
  v_tenant_name text;
  v_plan_name text;
  v_previous public.tenant_subscriptions%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  if p_status not in ('trialing', 'active', 'past_due', 'cancelled', 'expired') then
    raise exception 'Status de assinatura invalido';
  end if;

  if v_note is null then
    raise exception 'Informe o motivo da alteracao';
  end if;

  if char_length(v_note) > 500 then
    raise exception 'O motivo deve ter no maximo 500 caracteres';
  end if;

  select tenant.display_name
  into v_tenant_name
  from public.tenants tenant
  where tenant.id = p_tenant_id
  for update;

  if v_tenant_name is null then
    raise exception 'Assinante nao encontrado';
  end if;

  select plan.name
  into v_plan_name
  from public.saas_plans plan
  where plan.id = p_plan_id
    and plan.active = true;

  if v_plan_name is null then
    raise exception 'Plano ativo nao encontrado';
  end if;

  select subscription.*
  into v_previous
  from public.tenant_subscriptions subscription
  where subscription.tenant_id = p_tenant_id
  for update;

  if v_previous.id is null then
    insert into public.tenant_subscriptions (
      tenant_id,
      plan_id,
      status,
      current_period_start,
      cancelled_at
    )
    values (
      p_tenant_id,
      p_plan_id,
      p_status,
      case when p_status = 'active' then now() else null end,
      case when p_status = 'cancelled' then now() else null end
    );
  else
    update public.tenant_subscriptions
    set plan_id = p_plan_id,
        status = p_status,
        current_period_start = case
          when p_status = 'active' and v_previous.status <> 'active' then now()
          else current_period_start
        end,
        cancelled_at = case when p_status = 'cancelled' then now() else null end,
        updated_at = now()
    where tenant_id = p_tenant_id;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    p_tenant_id,
    auth.uid(),
    'owner.subscription_changed',
    'tenant_subscription',
    p_tenant_id::text,
    jsonb_build_object(
      'company_name', v_tenant_name,
      'previous_plan_id', v_previous.plan_id,
      'new_plan_id', p_plan_id,
      'new_plan_name', v_plan_name,
      'previous_status', v_previous.status,
      'new_status', p_status,
      'note', v_note
    )
  );
end;
$$;

revoke all on function private.owner_update_subscription_impl(uuid, uuid, text, text)
  from public, anon, service_role;
grant execute on function private.owner_update_subscription_impl(uuid, uuid, text, text)
  to authenticated;

create or replace function public.owner_update_subscription(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_status text,
  p_note text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.owner_update_subscription_impl(
    p_tenant_id,
    p_plan_id,
    p_status,
    p_note
  )
$$;

revoke all on function public.owner_update_subscription(uuid, uuid, text, text)
  from public, anon, service_role;
grant execute on function public.owner_update_subscription(uuid, uuid, text, text)
  to authenticated;

create or replace function private.owner_grant_free_days_impl(
  p_tenant_id uuid,
  p_days integer,
  p_note text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(p_note), '');
  v_tenant_name text;
  v_free_plan_id uuid;
  v_previous public.tenant_subscriptions%rowtype;
  v_new_trial_ends_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'Informe entre 1 e 3650 dias gratis';
  end if;

  if v_note is null then
    raise exception 'Informe o motivo da concessao';
  end if;

  if char_length(v_note) > 500 then
    raise exception 'O motivo deve ter no maximo 500 caracteres';
  end if;

  select tenant.display_name
  into v_tenant_name
  from public.tenants tenant
  where tenant.id = p_tenant_id
  for update;

  if v_tenant_name is null then
    raise exception 'Assinante nao encontrado';
  end if;

  select subscription.*
  into v_previous
  from public.tenant_subscriptions subscription
  where subscription.tenant_id = p_tenant_id
  for update;

  v_new_trial_ends_at := greatest(
    now(),
    coalesce(v_previous.trial_ends_at, now())
  ) + make_interval(days => p_days);

  if v_previous.id is null then
    select plan.id
    into v_free_plan_id
    from public.saas_plans plan
    where plan.code = 'free'
      and plan.active = true;

    if v_free_plan_id is null then
      raise exception 'Plano gratis ativo nao encontrado';
    end if;

    insert into public.tenant_subscriptions (
      tenant_id, plan_id, status, trial_ends_at
    )
    values (
      p_tenant_id, v_free_plan_id, 'trialing', v_new_trial_ends_at
    );
  else
    update public.tenant_subscriptions
    set status = 'trialing',
        trial_ends_at = v_new_trial_ends_at,
        cancelled_at = null,
        updated_at = now()
    where tenant_id = p_tenant_id;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    p_tenant_id,
    auth.uid(),
    'owner.free_days_granted',
    'tenant_subscription',
    p_tenant_id::text,
    jsonb_build_object(
      'company_name', v_tenant_name,
      'days', p_days,
      'previous_status', v_previous.status,
      'previous_trial_ends_at', v_previous.trial_ends_at,
      'new_status', 'trialing',
      'new_trial_ends_at', v_new_trial_ends_at,
      'note', v_note
    )
  );

  return v_new_trial_ends_at;
end;
$$;

revoke all on function private.owner_grant_free_days_impl(uuid, integer, text)
  from public, anon, service_role;
grant execute on function private.owner_grant_free_days_impl(uuid, integer, text)
  to authenticated;

create or replace function public.owner_grant_free_days(
  p_tenant_id uuid,
  p_days integer,
  p_note text
)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  select private.owner_grant_free_days_impl(p_tenant_id, p_days, p_note)
$$;

revoke all on function public.owner_grant_free_days(uuid, integer, text)
  from public, anon, service_role;
grant execute on function public.owner_grant_free_days(uuid, integer, text)
  to authenticated;

commit;
