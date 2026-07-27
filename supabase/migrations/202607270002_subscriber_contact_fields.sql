begin;

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles
  drop constraint if exists profiles_phone_digits_chk,
  add constraint profiles_phone_digits_chk
    check (phone is null or phone ~ '^[0-9]{11}$');

create index if not exists profiles_tenant_phone_idx
  on public.profiles (tenant_id, phone)
  where phone is not null;

create or replace function public.handle_subscriber_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text := regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'cpf', ''),
    '\D',
    '',
    'g'
  );
  v_phone text := regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    '\D',
    '',
    'g'
  );
  v_full_name text := trim(
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  v_company_name text := trim(
    coalesce(new.raw_user_meta_data ->> 'company_name', '')
  );
  v_tenant_id uuid;
  v_plan_id uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'subscriber' then
    return new;
  end if;

  if length(v_cpf) <> 11
    or length(v_phone) <> 11
    or v_full_name = ''
    or v_company_name = '' then
    raise exception 'Invalid subscriber data';
  end if;

  select id
  into v_plan_id
  from public.saas_plans
  where code = 'free'
    and active = true;

  insert into public.tenants (legal_name, display_name)
  values (v_company_name, v_company_name)
  returning id into v_tenant_id;

  insert into public.profiles (
    id,
    tenant_id,
    full_name,
    cpf,
    phone,
    role,
    active,
    mfa_required
  )
  values (
    new.id,
    v_tenant_id,
    v_full_name,
    v_cpf,
    v_phone,
    'admin',
    true,
    false
  );

  insert into public.tenant_subscriptions (
    tenant_id,
    plan_id,
    status,
    current_period_start,
    trial_ends_at
  )
  values (
    v_tenant_id,
    v_plan_id,
    'active',
    now(),
    now() + interval '7 days'
  );

  return new;
end;
$$;

commit;
