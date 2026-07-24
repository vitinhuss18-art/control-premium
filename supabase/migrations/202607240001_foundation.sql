begin;

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'super_admin',
  'admin',
  'operator',
  'collector',
  'client'
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  document text,
  currency char(3) not null default 'BRL',
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (role = 'super_admin' and tenant_id is null)
    or (role <> 'super_admin' and tenant_id is not null)
  )
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  internal_code bigint generated always as identity,
  full_name text not null,
  cpf text,
  phone text,
  email text,
  birth_date date,
  status text not null default 'incomplete'
    check (status in ('incomplete', 'under_review', 'approved', 'blocked', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, internal_code),
  unique (tenant_id, cpf)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index clients_tenant_name_idx
  on public.clients (tenant_id, lower(full_name));
create index clients_tenant_status_idx
  on public.clients (tenant_id, status);
create index audit_logs_tenant_occurred_idx
  on public.audit_logs (tenant_id, occurred_at desc);

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.profiles
  where id = auth.uid() and active = true
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role = 'super_admin'
  )
$$;

create or replace function public.has_staff_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('admin', 'operator', 'collector')
  )
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.audit_logs enable row level security;

create policy tenants_select_same_tenant
on public.tenants for select
using (id = public.current_tenant_id() or public.is_super_admin());

create policy profiles_select_same_tenant
on public.profiles for select
using (tenant_id = public.current_tenant_id() or id = auth.uid() or public.is_super_admin());

create policy clients_select_same_tenant
on public.clients for select
using (tenant_id = public.current_tenant_id() or public.is_super_admin());

create policy clients_insert_same_tenant
on public.clients for insert
with check (
  (tenant_id = public.current_tenant_id() and public.has_staff_role())
  or public.is_super_admin()
);

create policy clients_update_same_tenant
on public.clients for update
using (
  (tenant_id = public.current_tenant_id() and public.has_staff_role())
  or public.is_super_admin()
)
with check (
  (tenant_id = public.current_tenant_id() and public.has_staff_role())
  or public.is_super_admin()
);

create policy audit_logs_select_same_tenant
on public.audit_logs for select
using (tenant_id = public.current_tenant_id() or public.is_super_admin());

create policy audit_logs_insert_same_tenant
on public.audit_logs for insert
with check (
  (tenant_id = public.current_tenant_id() and public.has_staff_role())
  or public.is_super_admin()
);

revoke update, delete on public.audit_logs from authenticated;

commit;
