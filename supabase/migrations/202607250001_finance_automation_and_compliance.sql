begin;

alter table public.credit_proposals
  drop constraint if exists credit_proposals_status_check;
alter table public.credit_proposals
  add constraint credit_proposals_status_check
  check (status in (
    'draft', 'submitted', 'under_review', 'approved', 'rejected',
    'expired', 'converted', 'cancelled'
  )),
  add column if not exists periodic_interest_bps integer
    check (periodic_interest_bps between 0 and 10000),
  add column if not exists first_due_date date,
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists review_snapshot jsonb,
  add column if not exists score_snapshot jsonb;

alter table public.loans
  add column if not exists contracted_total_cents bigint
    check (contracted_total_cents > 0),
  add column if not exists version integer not null default 1
    check (version > 0);

alter table public.payments
  alter column installment_id drop not null,
  add column if not exists loan_id uuid,
  add column if not exists receipt_number text;

alter table public.payments
  add constraint payments_same_tenant_loan_fkey
  foreign key (tenant_id, loan_id)
  references public.loans (tenant_id, id) on delete restrict;

create unique index if not exists payments_tenant_receipt_idx
  on public.payments (tenant_id, receipt_number)
  where receipt_number is not null;

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  payment_id uuid not null,
  installment_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, payment_id, installment_id),
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict,
  foreign key (tenant_id, installment_id)
    references public.installments (tenant_id, id) on delete restrict
);

create table if not exists public.financial_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  loan_id uuid not null,
  payment_id uuid,
  entry_type text not null
    check (entry_type in (
      'loan_created', 'payment_confirmed', 'payment_reversed',
      'pix_refunded', 'adjustment'
    )),
  direction text not null check (direction in ('debit', 'credit')),
  amount_cents bigint not null check (amount_cents > 0),
  idempotency_key text not null,
  reverses_entry_id uuid references public.financial_ledger(id) on delete restrict,
  occurred_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, loan_id)
    references public.loans (tenant_id, id) on delete restrict,
  foreign key (tenant_id, payment_id)
    references public.payments (tenant_id, id) on delete restrict
);

create table if not exists public.receipt_sequences (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  next_value bigint not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now()
);

create or replace function public.prevent_financial_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'financial_ledger is immutable';
end
$$;

drop trigger if exists financial_ledger_immutable_update
  on public.financial_ledger;
create trigger financial_ledger_immutable_update
before update or delete on public.financial_ledger
for each row execute function public.prevent_financial_ledger_mutation();

create or replace function public.record_loan_payment(
  p_tenant_id uuid,
  p_loan_id uuid,
  p_amount_cents bigint,
  p_idempotency_key text,
  p_paid_at timestamptz
)
returns table(payment_id uuid, receipt_number text, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_receipt_number text;
  v_sequence bigint;
  v_remaining bigint := p_amount_cents;
  v_allocate bigint;
  v_outstanding bigint;
  v_installment record;
begin
  if p_tenant_id <> public.current_tenant_id()
    or public.current_user_role() not in ('admin', 'manager', 'operator')
  then
    raise exception 'payment permission denied';
  end if;
  if p_amount_cents <= 0
    or length(p_idempotency_key) < 8
    or length(p_idempotency_key) > 200
  then
    raise exception 'invalid payment';
  end if;

  select id, payments.receipt_number
  into v_payment_id, v_receipt_number
  from public.payments
  where tenant_id = p_tenant_id
    and idempotency_key = p_idempotency_key;
  if found then
    return query select v_payment_id, v_receipt_number, true;
    return;
  end if;

  perform 1
  from public.loans
  where tenant_id = p_tenant_id
    and id = p_loan_id
    and status in ('active', 'delinquent')
  for update;
  if not found then
    raise exception 'loan not payable';
  end if;

  perform 1
  from public.installments
  where tenant_id = p_tenant_id
    and loan_id = p_loan_id
  for update;

  select coalesce(sum(total_cents - paid_cents), 0)
  into v_outstanding
  from public.installments
  where tenant_id = p_tenant_id
    and loan_id = p_loan_id;
  if p_amount_cents > v_outstanding then
    raise exception 'payment exceeds outstanding balance';
  end if;

  insert into public.receipt_sequences (tenant_id, next_value)
  values (p_tenant_id, 2)
  on conflict (tenant_id) do update
    set next_value = public.receipt_sequences.next_value + 1,
        updated_at = now()
  returning next_value - 1 into v_sequence;
  v_receipt_number := 'R-' || lpad(v_sequence::text, 8, '0');

  insert into public.payments (
    tenant_id,
    loan_id,
    installment_id,
    amount_cents,
    method,
    status,
    idempotency_key,
    receipt_number,
    received_by,
    confirmed_at
  )
  values (
    p_tenant_id,
    p_loan_id,
    null,
    p_amount_cents,
    'other',
    'confirmed',
    p_idempotency_key,
    v_receipt_number,
    auth.uid(),
    p_paid_at
  )
  returning id into v_payment_id;

  for v_installment in
    select id, sequence_number, total_cents, paid_cents
    from public.installments
    where tenant_id = p_tenant_id
      and loan_id = p_loan_id
      and paid_cents < total_cents
    order by sequence_number
    for update
  loop
    exit when v_remaining = 0;
    v_allocate := least(
      v_remaining,
      v_installment.total_cents - v_installment.paid_cents
    );

    insert into public.payment_allocations (
      tenant_id, payment_id, installment_id, amount_cents
    )
    values (
      p_tenant_id, v_payment_id, v_installment.id, v_allocate
    );

    update public.installments
    set paid_cents = paid_cents + v_allocate,
        status = case
          when paid_cents + v_allocate = total_cents then 'paid'
          else 'partially_paid'
        end,
        paid_at = case
          when paid_cents + v_allocate = total_cents then p_paid_at
          else paid_at
        end
    where tenant_id = p_tenant_id
      and id = v_installment.id;

    v_remaining := v_remaining - v_allocate;
  end loop;
  if v_remaining <> 0 then
    raise exception 'payment allocation failed';
  end if;

  insert into public.financial_ledger (
    tenant_id,
    loan_id,
    payment_id,
    entry_type,
    direction,
    amount_cents,
    idempotency_key,
    occurred_at,
    created_by
  )
  values (
    p_tenant_id,
    p_loan_id,
    v_payment_id,
    'payment_confirmed',
    'credit',
    p_amount_cents,
    p_idempotency_key,
    p_paid_at,
    auth.uid()
  );

  update public.loans
  set version = version + 1,
      status = case
        when v_outstanding = p_amount_cents then 'settled'
        else status
      end,
      settled_at = case
        when v_outstanding = p_amount_cents then p_paid_at
        else settled_at
      end
  where tenant_id = p_tenant_id and id = p_loan_id;

  return query select v_payment_id, v_receipt_number, false;
end
$$;

create or replace function public.reverse_loan_payment(
  p_tenant_id uuid,
  p_payment_id uuid,
  p_idempotency_key text,
  p_reason text,
  p_reversed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
  v_allocation record;
begin
  if p_tenant_id <> public.current_tenant_id()
    or public.current_user_role() not in ('admin', 'manager')
  then
    raise exception 'reversal permission denied';
  end if;
  if length(trim(p_reason)) < 10
    or length(p_idempotency_key) < 8
    or length(p_idempotency_key) > 200
  then
    raise exception 'invalid reversal';
  end if;

  select *
  into v_payment
  from public.payments
  where tenant_id = p_tenant_id and id = p_payment_id
  for update;
  if not found then
    raise exception 'payment not found';
  end if;
  if v_payment.status = 'reversed' then
    return false;
  end if;
  if v_payment.status <> 'confirmed' then
    raise exception 'payment is not reversible';
  end if;

  for v_allocation in
    select *
    from public.payment_allocations
    where tenant_id = p_tenant_id and payment_id = p_payment_id
    for update
  loop
    update public.installments
    set paid_cents = paid_cents - v_allocation.amount_cents,
        status = case
          when paid_cents - v_allocation.amount_cents = 0
            and due_date < p_reversed_at::date then 'overdue'
          when paid_cents - v_allocation.amount_cents = 0 then 'pending'
          else 'partially_paid'
        end,
        paid_at = null
    where tenant_id = p_tenant_id
      and id = v_allocation.installment_id
      and paid_cents >= v_allocation.amount_cents;
    if not found then
      raise exception 'reversal allocation failed';
    end if;
  end loop;

  update public.payments
  set status = 'reversed',
      reversed_at = p_reversed_at,
      reversal_reason = trim(p_reason),
      updated_at = now()
  where tenant_id = p_tenant_id and id = p_payment_id;

  insert into public.financial_ledger (
    tenant_id,
    loan_id,
    payment_id,
    entry_type,
    direction,
    amount_cents,
    idempotency_key,
    reverses_entry_id,
    occurred_at,
    created_by
  )
  select
    p_tenant_id,
    v_payment.loan_id,
    p_payment_id,
    'payment_reversed',
    'debit',
    v_payment.amount_cents,
    p_idempotency_key,
    id,
    p_reversed_at,
    auth.uid()
  from public.financial_ledger
  where tenant_id = p_tenant_id
    and payment_id = p_payment_id
    and entry_type = 'payment_confirmed';

  update public.loans
  set version = version + 1,
      status = 'active',
      settled_at = null
  where tenant_id = p_tenant_id and id = v_payment.loan_id;

  return true;
end
$$;

alter table public.contracts
  add column if not exists loan_id uuid,
  add column if not exists parent_contract_id uuid
    references public.contracts(id) on delete restrict,
  add column if not exists signature_envelope_id text,
  add column if not exists signature_evidence jsonb not null default '[]'::jsonb,
  add column if not exists original_sha256 char(64);

alter table public.contracts
  add constraint contracts_same_tenant_loan_fkey
  foreign key (tenant_id, loan_id)
  references public.loans (tenant_id, id) on delete restrict;

alter table public.pix_transactions
  add column if not exists loan_id uuid,
  add column if not exists copy_paste_ciphertext text,
  add column if not exists end_to_end_id text,
  add column if not exists refund_id text,
  add column if not exists refunded_at timestamptz;

alter table public.pix_transactions
  add constraint pix_transactions_same_tenant_loan_fkey
  foreign key (tenant_id, loan_id)
  references public.loans (tenant_id, id) on delete restrict;

create unique index if not exists pix_transactions_end_to_end_idx
  on public.pix_transactions (tenant_id, end_to_end_id)
  where end_to_end_id is not null;

alter table public.notifications
  add column if not exists category text,
  add column if not exists recipient text,
  add column if not exists attempts integer not null default 0
    check (attempts >= 0),
  add column if not exists last_error_code text;

create table if not exists public.message_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid not null,
  recipient text not null,
  channel text not null check (channel in ('whatsapp', 'email', 'push')),
  status text not null check (status in ('granted', 'revoked', 'opted_out')),
  source text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, recipient, channel),
  foreign key (tenant_id, client_id)
    references public.clients (tenant_id, id) on delete restrict
);

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  task text not null
    check (task in (
      'message_draft', 'portfolio_summary',
      'priority_explanation', 'anomaly_review'
    )),
  model text not null,
  prompt_version text not null,
  output_ciphertext text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected')),
  input_flags jsonb not null default '[]'::jsonb,
  output_flags jsonb not null default '[]'::jsonb,
  token_count integer not null check (token_count >= 0),
  cost_cents bigint not null check (cost_cents >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  provider_subscription_id text not null,
  event_type text not null,
  payload_hash char(64) not null,
  occurred_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  client_id uuid,
  request_type text not null
    check (request_type in ('access', 'correction', 'export', 'deletion', 'objection')),
  status text not null default 'received'
    check (status in ('received', 'identity_verification', 'in_progress', 'completed', 'denied')),
  legal_hold boolean not null default false,
  decision_reason text,
  requested_at timestamptz not null default now(),
  due_at timestamptz not null,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  foreign key (tenant_id, client_id)
    references public.clients (tenant_id, id) on delete restrict
);

create table if not exists public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'contained', 'eradicated', 'recovered', 'closed')),
  detected_at timestamptz not null,
  contained_at timestamptz,
  closed_at timestamptz,
  summary text not null,
  evidence_path text,
  created_at timestamptz not null default now()
);

create index if not exists payment_allocations_tenant_payment_idx
  on public.payment_allocations (tenant_id, payment_id);
create index if not exists financial_ledger_tenant_loan_idx
  on public.financial_ledger (tenant_id, loan_id, occurred_at);
create index if not exists message_consents_tenant_client_idx
  on public.message_consents (tenant_id, client_id);
create index if not exists ai_suggestions_tenant_status_idx
  on public.ai_suggestions (tenant_id, status, created_at);
create index if not exists subscription_events_tenant_idx
  on public.subscription_events (tenant_id, occurred_at);
create index if not exists data_subject_requests_due_idx
  on public.data_subject_requests (tenant_id, status, due_at);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'payment_allocations',
    'financial_ledger',
    'message_consents',
    'ai_suggestions',
    'subscription_events',
    'data_subject_requests',
    'security_incidents'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I_select_same_tenant on public.%I for select '
      'using (tenant_id = public.current_tenant_id() or public.is_super_admin())',
      table_name,
      table_name
    );
  end loop;
end
$$;

revoke insert, update, delete on
  public.payment_allocations,
  public.financial_ledger,
  public.ai_suggestions,
  public.subscription_events
from authenticated;

commit;
