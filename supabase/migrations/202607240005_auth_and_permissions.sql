begin;

alter table public.profiles
  add column if not exists cpf text,
  add column if not exists contact_confirmed_at timestamptz,
  add column if not exists mfa_required boolean not null default false,
  add column if not exists last_login_at timestamptz,
  add column if not exists deactivated_at timestamptz;

create unique index if not exists profiles_tenant_cpf_idx
  on public.profiles (tenant_id, cpf)
  where cpf is not null;

create table public.role_permissions (
  role public.app_role not null,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (role, permission)
);

insert into public.role_permissions (role, permission)
values
  ('super_admin', '*'),
  ('admin', 'tenant.manage'),
  ('admin', 'members.manage'),
  ('admin', 'clients.read'),
  ('admin', 'clients.write'),
  ('admin', 'proposals.read'),
  ('admin', 'proposals.write'),
  ('admin', 'proposals.approve'),
  ('admin', 'collections.manage'),
  ('admin', 'finance.read'),
  ('admin', 'finance.write'),
  ('admin', 'finance.reverse'),
  ('manager', 'members.manage'),
  ('manager', 'clients.read'),
  ('manager', 'clients.write'),
  ('manager', 'proposals.read'),
  ('manager', 'proposals.write'),
  ('manager', 'proposals.approve'),
  ('manager', 'collections.manage'),
  ('manager', 'finance.read'),
  ('manager', 'finance.write'),
  ('operator', 'clients.read'),
  ('operator', 'clients.write'),
  ('operator', 'proposals.read'),
  ('operator', 'proposals.write'),
  ('operator', 'finance.read'),
  ('collector', 'clients.read'),
  ('collector', 'collections.manage'),
  ('collector', 'finance.read'),
  ('client', 'portal.read')
on conflict do nothing;

create table public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text,
  phone text,
  role public.app_role not null,
  token_hash char(64) not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null),
  check (role not in ('super_admin', 'client'))
);

create table public.auth_events (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null
    check (event_type in (
      'sign_up', 'login_success', 'login_failure', 'logout',
      'password_reset_requested', 'password_changed',
      'mfa_enrolled', 'mfa_challenge_failure', 'session_revoked'
    )),
  ip_hash char(64),
  user_agent_hash char(64),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index member_invitations_tenant_status_idx
  on public.member_invitations (tenant_id, status, expires_at);
create index auth_events_tenant_time_idx
  on public.auth_events (tenant_id, occurred_at desc);
create index auth_events_user_time_idx
  on public.auth_events (user_id, occurred_at desc);

create or replace function public.role_has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.role_permissions permission
      on permission.role = profile.role
    where profile.id = auth.uid()
      and profile.active = true
      and (
        permission.permission = '*'
        or permission.permission = required_permission
      )
  )
$$;

create or replace function public.bootstrap_tenant(
  tenant_legal_name text,
  tenant_display_name text,
  administrator_full_name text,
  tenant_document text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'User already belongs to a tenant';
  end if;

  if nullif(trim(tenant_legal_name), '') is null
    or nullif(trim(tenant_display_name), '') is null
    or nullif(trim(administrator_full_name), '') is null then
    raise exception 'Required tenant fields are missing';
  end if;

  insert into public.tenants (legal_name, display_name, document)
  values (
    trim(tenant_legal_name),
    trim(tenant_display_name),
    nullif(trim(tenant_document), '')
  )
  returning id into new_tenant_id;

  insert into public.profiles (
    id,
    tenant_id,
    full_name,
    role,
    active,
    mfa_required
  )
  values (
    auth.uid(),
    new_tenant_id,
    trim(administrator_full_name),
    'admin',
    true,
    true
  );

  insert into public.audit_logs (
    tenant_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    new_tenant_id,
    auth.uid(),
    'tenant.bootstrap',
    'tenant',
    new_tenant_id::text,
    jsonb_build_object('role', 'admin')
  );

  return new_tenant_id;
end;
$$;

create or replace function public.accept_member_invitation(
  invitation_token text,
  member_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  invitation public.member_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'User already belongs to a tenant';
  end if;

  select *
  into invitation
  from public.member_invitations
  where token_hash = encode(digest(invitation_token, 'sha256'), 'hex')
    and status = 'pending'
  for update;

  if invitation.id is null then
    raise exception 'Invitation is invalid';
  end if;

  if invitation.expires_at <= now() then
    update public.member_invitations
    set status = 'expired'
    where id = invitation.id;
    raise exception 'Invitation has expired';
  end if;

  insert into public.profiles (
    id,
    tenant_id,
    full_name,
    role,
    active,
    mfa_required
  )
  values (
    auth.uid(),
    invitation.tenant_id,
    trim(member_full_name),
    invitation.role,
    true,
    invitation.role in ('admin', 'manager')
  );

  update public.member_invitations
  set
    status = 'accepted',
    accepted_by = auth.uid(),
    accepted_at = now()
  where id = invitation.id;

  insert into public.audit_logs (
    tenant_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    invitation.tenant_id,
    auth.uid(),
    'member.invitation.accepted',
    'profile',
    auth.uid()::text,
    jsonb_build_object('role', invitation.role)
  );

  return invitation.tenant_id;
end;
$$;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  actor_role := public.current_user_role();

  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'Tenant membership cannot be changed';
  end if;

  if new.role is distinct from old.role then
    if actor_role not in ('super_admin', 'admin') then
      raise exception 'Only an administrator can change roles';
    end if;
    if new.role = 'super_admin' and actor_role <> 'super_admin' then
      raise exception 'Only a super administrator can assign this role';
    end if;
  end if;

  if new.active is distinct from old.active
    and actor_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Only a manager can change member status';
  end if;

  new.deactivated_at := case when new.active then null else coalesce(old.deactivated_at, now()) end;
  new.mfa_required := new.role in ('super_admin', 'admin', 'manager');

  return new;
end;
$$;

create trigger profiles_protect_privileges
before update on public.profiles
for each row execute function public.protect_profile_privileges();

alter table public.role_permissions enable row level security;
alter table public.member_invitations enable row level security;
alter table public.auth_events enable row level security;

create policy role_permissions_read_authenticated
on public.role_permissions for select
to authenticated
using (true);

create policy member_invitations_select_managers
on public.member_invitations for select
using (
  tenant_id = public.current_tenant_id()
  and public.role_has_permission('members.manage')
);

create policy member_invitations_insert_managers
on public.member_invitations for insert
with check (
  tenant_id = public.current_tenant_id()
  and public.role_has_permission('members.manage')
  and role not in ('super_admin', 'client')
  and expires_at > now()
);

create policy member_invitations_update_managers
on public.member_invitations for update
using (
  tenant_id = public.current_tenant_id()
  and public.role_has_permission('members.manage')
)
with check (
  tenant_id = public.current_tenant_id()
  and public.role_has_permission('members.manage')
);

create policy auth_events_select_managers
on public.auth_events for select
using (
  tenant_id = public.current_tenant_id()
  and public.role_has_permission('members.manage')
  or public.is_super_admin()
);

create policy profiles_update_self
on public.profiles for update
using (id = auth.uid() and active = true)
with check (id = auth.uid() and tenant_id = public.current_tenant_id());

revoke all on function public.bootstrap_tenant(text, text, text, text) from public;
revoke all on function public.accept_member_invitation(text, text) from public;
grant execute on function public.bootstrap_tenant(text, text, text, text) to authenticated;
grant execute on function public.accept_member_invitation(text, text) to authenticated;

revoke insert, update, delete on public.role_permissions from authenticated;
revoke insert, update, delete on public.auth_events from authenticated;

commit;
