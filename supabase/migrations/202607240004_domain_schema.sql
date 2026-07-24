begin;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and active = true
$$;

create or replace function public.has_any_role(allowed_roles public.app_role[])
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
      and role = any(allowed_roles)
  )
$$;

create or replace function public.has_staff_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(
    array[
      'admin'::public.app_role,
      'manager'::public.app_role,
      'operator'::public.app_role,
      'collector'::public.app_role
    ]
  )
$$;

create or replace function public.can_manage_tenant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(
    array['admin'::public.app_role, 'manager'::public.app_role]
  )
$$;

alter table public.clients
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz;

create unique index if not exists clients_tenant_user_idx
  on public.clients (tenant_id, user_id)
  where user_id is not null;

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('phone', 'email', 'whatsapp', 'other')),
  value text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_id, kind, value)
);

create table public.client_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null default 'residential'
    check (kind in ('residential', 'commercial', 'billing', 'other')),
  postal_code text,
  street text not null,
  number text,
  complement text,
  district text,
  city text not null,
  state char(2) not null,
  country char(2) not null default 'BR',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null,
  storage_path text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 char(64),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'expired')),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, storage_path)
);

create table public.credit_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'BRL',
  term_count integer not null check (term_count > 0),
  frequency text not null
    check (frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  purpose text,
  status text not null default 'draft'
    check (status in (
      'draft', 'under_review', 'approved', 'rejected', 'expired', 'cancelled'
    )),
  rule_version text,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  decision_reason text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  valid_until date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  proposal_id uuid not null references public.credit_proposals(id) on delete restrict,
  principal_cents bigint not null check (principal_cents > 0),
  currency char(3) not null default 'BRL',
  status text not null default 'pending_contract'
    check (status in (
      'pending_contract', 'pending_disbursement', 'active', 'settled',
      'delinquent', 'cancelled'
    )),
  contract_id uuid,
  disbursed_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, proposal_id)
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  sequence_number integer not null check (sequence_number > 0),
  due_date date not null,
  principal_cents bigint not null check (principal_cents >= 0),
  interest_cents bigint not null default 0 check (interest_cents >= 0),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  total_cents bigint generated always as
    (principal_cents + interest_cents + fee_cents) stored,
  status text not null default 'pending'
    check (status in (
      'pending', 'partially_paid', 'paid', 'overdue', 'cancelled'
    )),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, loan_id, sequence_number),
  check (paid_cents <= principal_cents + interest_cents + fee_cents)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  installment_id uuid not null references public.installments(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'BRL',
  method text not null check (method in ('pix', 'cash', 'bank_transfer', 'other')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'reversed', 'failed')),
  idempotency_key text not null,
  external_reference text,
  received_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table public.collection_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  loan_id uuid references public.loans(id) on delete restrict,
  installment_id uuid references public.installments(id) on delete restrict,
  kind text not null
    check (kind in ('reminder', 'contact', 'promise', 'visit', 'escalation', 'note')),
  channel text check (channel in ('whatsapp', 'phone', 'email', 'in_person', 'system')),
  outcome text,
  promised_for date,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.renegotiations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'proposed', 'accepted', 'rejected', 'cancelled')),
  previous_terms jsonb not null,
  proposed_terms jsonb not null,
  reason text not null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid references public.clients(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'whatsapp', 'push')),
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'failed', 'cancelled')),
  idempotency_key text not null,
  provider_reference text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  proposal_id uuid references public.credit_proposals(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'generated', 'sent', 'signed', 'voided')),
  template_version text not null,
  storage_path text,
  signed_storage_path text,
  sha256 char(64),
  signed_sha256 char(64),
  generated_at timestamptz,
  signed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id, version)
);

alter table public.loans
  add constraint loans_contract_id_fkey
  foreign key (contract_id) references public.contracts(id) on delete restrict;

create table public.pix_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  installment_id uuid references public.installments(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  provider text not null,
  provider_charge_id text,
  idempotency_key text not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'BRL',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'refunded', 'failed')),
  expires_at timestamptz,
  paid_at timestamptz,
  payload_hash char(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, idempotency_key),
  unique (tenant_id, provider, provider_charge_id)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_hash char(64) not null,
  signature_valid boolean not null default false,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create table public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  price_cents bigint not null check (price_cents >= 0),
  currency char(3) not null default 'BRL',
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saas_plan_limits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.saas_plans(id) on delete cascade,
  limit_key text not null,
  limit_value bigint check (limit_value is null or limit_value >= 0),
  created_at timestamptz not null default now(),
  unique (plan_id, limit_key)
);

create table public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  plan_id uuid not null references public.saas_plans(id) on delete restrict,
  provider text,
  provider_subscription_id text,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  scope text not null,
  idempotency_key text not null,
  request_hash char(64) not null,
  response_status integer,
  response_body jsonb,
  locked_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  unique (tenant_id, scope, idempotency_key)
);

alter table public.clients
  add constraint clients_tenant_id_id_key unique (tenant_id, id);
alter table public.credit_proposals
  add constraint credit_proposals_tenant_id_id_key unique (tenant_id, id);
alter table public.loans
  add constraint loans_tenant_id_id_key unique (tenant_id, id);
alter table public.installments
  add constraint installments_tenant_id_id_key unique (tenant_id, id);
alter table public.payments
  add constraint payments_tenant_id_id_key unique (tenant_id, id);
alter table public.contracts
  add constraint contracts_tenant_id_id_key unique (tenant_id, id);

alter table public.client_contacts
  add constraint client_contacts_same_tenant_client_fkey
  foreign key (tenant_id, client_id)
  references public.clients (tenant_id, id) on delete cascade;
alter table public.client_addresses
  add constraint client_addresses_same_tenant_client_fkey
  foreign key (tenant_id, client_id)
  references public.clients (tenant_id, id) on delete cascade;
alter table public.client_documents
  add constraint client_documents_same_tenant_client_fkey
  foreign key (tenant_id, client_id)
  references public.clients (tenant_id, id) on delete cascade;
alter table public.credit_proposals
  add constraint credit_proposals_same_tenant_client_fkey
  foreign key (tenant_id, client_id)
  references public.clients (tenant_id, id) on delete restrict;
alter table public.loans
  add constraint loans_same_tenant_client_fkey
  foreign key (tenant_id, client_id)
  references public.clients (tenant_id, id) on delete restrict,
  add constraint loans_same_tenant_proposal_fkey
  foreign key (tenant_id, proposal_id)
  references public.credit_proposals (tenant_id, id) on delete restrict,
  add constraint loans_same_tenant_contract_fkey
  foreign key (tenant_id, contract_id)
  references public.contracts (tenant_id, id) on delete restrict;
alter table public.installments
  add constraint installments_same_tenant_loan_fkey
  foreign key (tenant_id, loan_id)
  references public.loans (tenant_id, id) on delete restrict;
alter table public.payments
  add constraint payments_same_tenant_installment_fkey
  foreign key (tenant_id, installment_id)
  references public.installments (tenant_id, id) on delete restrict;
alter table public.collection_events
  add constraint collection_events_same_tenant_client_fkey
  foreign key (tenant_id, client_id)
  references public.clients (tenant_id, id) on delete restrict,
  add constraint collection_events_same_tenant_loan_fkey
  foreign key (tenant_id, loan_id)
  references public.loans (tenant_id, id) on delete restrict,
  add constraint collection_events_same_tenant_installment_fkey
  foreign key (tenant_id, installment_id)
  references public.installments (tenant_id, id) on delete restrict;
alter table public.renegotiations
  add constraint renegotiations_same_tenant_loan_fkey
  foreign key (tenant_id, loan_id)
  references public.loans (tenant_id, id) on delete restrict;
alter table public.notifications
  add constraint notifications_same_tenant_client_fkey
  foreign key (tenant_id, client_id)
  references public.clients (tenant_id, id) on delete cascade;
alter table public.contracts
  add constraint contracts_same_tenant_client_fkey
  foreign key (tenant_id, client_id)
  references public.clients (tenant_id, id) on delete restrict,
  add constraint contracts_same_tenant_proposal_fkey
  foreign key (tenant_id, proposal_id)
  references public.credit_proposals (tenant_id, id) on delete restrict;
alter table public.pix_transactions
  add constraint pix_transactions_same_tenant_installment_fkey
  foreign key (tenant_id, installment_id)
  references public.installments (tenant_id, id) on delete restrict,
  add constraint pix_transactions_same_tenant_payment_fkey
  foreign key (tenant_id, payment_id)
  references public.payments (tenant_id, id) on delete restrict;

create index client_contacts_tenant_client_idx
  on public.client_contacts (tenant_id, client_id);
create index client_addresses_tenant_client_idx
  on public.client_addresses (tenant_id, client_id);
create index client_documents_tenant_client_idx
  on public.client_documents (tenant_id, client_id);
create index credit_proposals_tenant_status_idx
  on public.credit_proposals (tenant_id, status, created_at desc);
create index loans_tenant_client_idx
  on public.loans (tenant_id, client_id, status);
create index installments_tenant_due_idx
  on public.installments (tenant_id, due_date, status);
create index payments_tenant_installment_idx
  on public.payments (tenant_id, installment_id, created_at desc);
create index collection_events_tenant_client_idx
  on public.collection_events (tenant_id, client_id, created_at desc);
create index notifications_tenant_status_idx
  on public.notifications (tenant_id, status, scheduled_for);
create index pix_transactions_tenant_status_idx
  on public.pix_transactions (tenant_id, status, created_at desc);
create index webhook_events_status_idx
  on public.webhook_events (provider, status, received_at);
create index idempotency_keys_expiry_idx
  on public.idempotency_keys (tenant_id, expires_at);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'client_contacts',
    'client_addresses',
    'client_documents',
    'credit_proposals',
    'loans',
    'installments',
    'payments',
    'renegotiations',
    'notifications',
    'contracts',
    'pix_transactions',
    'saas_plans',
    'tenant_subscriptions'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'client_contacts',
    'client_addresses',
    'client_documents',
    'credit_proposals',
    'loans',
    'installments',
    'payments',
    'collection_events',
    'renegotiations',
    'notifications',
    'contracts',
    'pix_transactions',
    'webhook_events',
    'saas_plans',
    'saas_plan_limits',
    'tenant_subscriptions',
    'idempotency_keys'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$$;

drop policy if exists clients_select_same_tenant on public.clients;
create policy clients_select_allowed
on public.clients for select
using (
  public.is_super_admin()
  or (
    tenant_id = public.current_tenant_id()
    and (
      public.has_staff_role()
      or user_id = auth.uid()
    )
  )
);

create policy tenants_update_managers
on public.tenants for update
using (
  id = public.current_tenant_id() and public.can_manage_tenant()
)
with check (
  id = public.current_tenant_id() and public.can_manage_tenant()
);

create policy profiles_update_managers
on public.profiles for update
using (
  tenant_id = public.current_tenant_id() and public.can_manage_tenant()
)
with check (
  tenant_id = public.current_tenant_id() and public.can_manage_tenant()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'client_contacts',
    'client_addresses',
    'client_documents',
    'credit_proposals',
    'collection_events',
    'renegotiations',
    'notifications',
    'contracts'
  ]
  loop
    execute format(
      'create policy %I_select_same_tenant on public.%I for select '
      'using (tenant_id = public.current_tenant_id() or public.is_super_admin())',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_insert_staff on public.%I for insert '
      'with check ((tenant_id = public.current_tenant_id() and public.has_staff_role()) '
      'or public.is_super_admin())',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_update_staff on public.%I for update '
      'using ((tenant_id = public.current_tenant_id() and public.has_staff_role()) '
      'or public.is_super_admin()) '
      'with check ((tenant_id = public.current_tenant_id() and public.has_staff_role()) '
      'or public.is_super_admin())',
      table_name,
      table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'loans',
    'installments',
    'payments',
    'pix_transactions',
    'tenant_subscriptions',
    'idempotency_keys'
  ]
  loop
    execute format(
      'create policy %I_select_same_tenant on public.%I for select '
      'using (tenant_id = public.current_tenant_id() or public.is_super_admin())',
      table_name,
      table_name
    );
  end loop;
end
$$;

create policy webhook_events_select_same_tenant
on public.webhook_events for select
using (
  tenant_id = public.current_tenant_id()
  or (tenant_id is null and public.is_super_admin())
  or public.is_super_admin()
);

create policy saas_plans_read_authenticated
on public.saas_plans for select
to authenticated
using (active = true or public.is_super_admin());

create policy saas_plan_limits_read_authenticated
on public.saas_plan_limits for select
to authenticated
using (true);

revoke insert, update, delete on
  public.loans,
  public.installments,
  public.payments,
  public.pix_transactions,
  public.webhook_events,
  public.tenant_subscriptions,
  public.idempotency_keys
from authenticated;

commit;
