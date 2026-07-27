begin;

insert into public.saas_plans (code, name, active, price_cents, currency, billing_interval)
values ('free', 'Grátis', true, 0, 'BRL', 'monthly')
on conflict (code) do update
set name = excluded.name, active = true, price_cents = 0;

insert into public.saas_plan_limits (plan_id, limit_key, limit_value)
select id, limits.limit_key, limits.limit_value
from public.saas_plans
cross join (
  values
    ('clients', 15::bigint),
    ('users', 1::bigint),
    ('whatsapp_messages', 0::bigint),
    ('storage_bytes', 0::bigint)
) as limits(limit_key, limit_value)
where code = 'free'
on conflict (plan_id, limit_key) do update
set limit_value = excluded.limit_value;

create table public.login_rate_limits (
  scope text not null,
  identity_hash char(64) not null,
  window_started_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (scope, identity_hash)
);

alter table public.login_rate_limits enable row level security;
revoke all on public.login_rate_limits from anon, authenticated;

create or replace function public.consume_login_rate_limit(
  p_scope text,
  p_identity text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash char(64) := encode(digest(coalesce(p_identity, ''), 'sha256'), 'hex');
  v_row public.login_rate_limits%rowtype;
begin
  if nullif(trim(p_scope), '') is null
    or nullif(p_identity, '') is null
    or p_limit < 1
    or p_window_seconds < 1 then
    raise exception 'Invalid rate limit policy';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_scope || v_hash));
  select * into v_row
  from public.login_rate_limits
  where scope = p_scope and identity_hash = v_hash
  for update;

  if v_row.scope is null then
    insert into public.login_rate_limits(scope, identity_hash, window_started_at, attempts)
    values (p_scope, v_hash, now(), 1)
    returning * into v_row;
  elsif v_row.window_started_at + make_interval(secs => p_window_seconds) <= now() then
    update public.login_rate_limits
    set window_started_at = now(), attempts = 1
    where scope = p_scope and identity_hash = v_hash
    returning * into v_row;
  else
    update public.login_rate_limits
    set attempts = attempts + 1
    where scope = p_scope and identity_hash = v_hash
    returning * into v_row;
  end if;

  allowed := v_row.attempts <= p_limit;
  retry_after := greatest(
    1,
    ceil(extract(epoch from (
      v_row.window_started_at + make_interval(secs => p_window_seconds) - now()
    )))::integer
  );
  return next;
end;
$$;

revoke all on function public.consume_login_rate_limit(text, text, integer, integer)
  from public;
grant execute on function public.consume_login_rate_limit(text, text, integer, integer)
  to service_role;

create or replace function public.reset_login_rate_limit(
  p_scope text,
  p_identity text
)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.login_rate_limits
  where scope = p_scope
    and identity_hash = encode(digest(coalesce(p_identity, ''), 'sha256'), 'hex')
$$;

revoke all on function public.reset_login_rate_limit(text, text) from public;
grant execute on function public.reset_login_rate_limit(text, text)
  to service_role;

create unique index profiles_subscriber_cpf_idx
  on public.profiles (cpf)
  where role = 'admin' and cpf is not null;

create or replace function public.handle_subscriber_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g');
  v_full_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  v_company_name text := trim(coalesce(new.raw_user_meta_data ->> 'company_name', ''));
  v_tenant_id uuid;
  v_plan_id uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'subscriber' then
    return new;
  end if;
  if length(v_cpf) <> 11 or v_full_name = '' or v_company_name = '' then
    raise exception 'Invalid subscriber data';
  end if;

  select id into v_plan_id
  from public.saas_plans
  where code = 'free' and active = true;

  insert into public.tenants (legal_name, display_name)
  values (v_company_name, v_company_name)
  returning id into v_tenant_id;

  insert into public.profiles (
    id, tenant_id, full_name, cpf, role, active, mfa_required
  )
  values (new.id, v_tenant_id, v_full_name, v_cpf, 'admin', true, false);

  insert into public.tenant_subscriptions (
    tenant_id, plan_id, status, current_period_start, trial_ends_at
  )
  values (v_tenant_id, v_plan_id, 'active', now(), now() + interval '7 days');

  return new;
end;
$$;

drop trigger if exists on_subscriber_auth_user_created on auth.users;
create trigger on_subscriber_auth_user_created
after insert on auth.users
for each row execute function public.handle_subscriber_signup();

create or replace function public.enforce_client_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit bigint;
  v_usage bigint;
begin
  select plan_limit.limit_value
  into v_limit
  from public.tenant_subscriptions subscription
  join public.saas_plan_limits plan_limit
    on plan_limit.plan_id = subscription.plan_id
  where subscription.tenant_id = new.tenant_id
    and plan_limit.limit_key = 'clients';

  if v_limit is null then return new; end if;
  select count(*) into v_usage
  from public.clients
  where tenant_id = new.tenant_id;
  if v_usage >= v_limit then
    raise exception using
      errcode = 'P0001',
      message = 'Limite de clientes atingido. Faça upgrade para continuar.';
  end if;
  return new;
end;
$$;

drop trigger if exists clients_enforce_plan_limit on public.clients;
create trigger clients_enforce_plan_limit
before insert on public.clients
for each row execute function public.enforce_client_plan_limit();

create or replace function public.client_login_by_cpf(
  p_cpf text,
  p_phone_last4 text
)
returns table(client_id uuid, full_name text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf_digits text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone_last4 text := regexp_replace(coalesce(p_phone_last4, ''), '\D', '', 'g');
  v_match_count integer;
  v_allowed boolean;
begin
  if length(v_cpf_digits) <> 11 or length(v_phone_last4) <> 4 then return; end if;
  select rate.allowed into v_allowed
  from public.consume_login_rate_limit(
    'client_portal', v_cpf_digits || ':' || v_phone_last4, 5, 900
  ) rate;
  if not coalesce(v_allowed, false) then return; end if;

  select count(*) into v_match_count
  from public.clients c
  where c.cpf = v_cpf_digits
    and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 4) = v_phone_last4;
  if v_match_count <> 1 then return; end if;

  perform public.reset_login_rate_limit(
    'client_portal',
    v_cpf_digits || ':' || v_phone_last4
  );
  return query
    select c.id, c.full_name, c.status
    from public.clients c
    where c.cpf = v_cpf_digits
      and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 4) = v_phone_last4
    limit 1;
end;
$$;

revoke all on function public.client_login_by_cpf(text, text) from public;
grant execute on function public.client_login_by_cpf(text, text)
  to anon, authenticated;

commit;
