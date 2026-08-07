begin;

-- Catalogo oficial do SaaS. O valor cobrado sempre vem do banco, nunca do
-- navegador, para impedir alteracao do preco pelo cliente.
insert into public.saas_plans (
  code, name, active, price_cents, currency, billing_interval
)
values ('premium', 'Premium', true, 4990, 'BRL', 'monthly')
on conflict (code) do update
set name = excluded.name,
    active = true,
    price_cents = excluded.price_cents,
    currency = excluded.currency,
    billing_interval = excluded.billing_interval,
    updated_at = now();

insert into public.saas_plan_limits (plan_id, limit_key, limit_value)
select plan.id, limits.limit_key, limits.limit_value
from public.saas_plans plan
cross join (
  values
    ('clients', 500::bigint),
    ('users', 5::bigint),
    ('whatsapp_messages', 5000::bigint),
    ('storage_bytes', 10737418240::bigint)
) as limits(limit_key, limit_value)
where plan.code = 'premium'
on conflict (plan_id, limit_key) do update
set limit_value = excluded.limit_value;

-- Faturas da assinatura do Control Premium. Esta tabela e separada de
-- payments/pix_transactions, que representam cobrancas dos clientes de cada
-- assinante e pertencem a outro fluxo financeiro.
create table public.saas_billing_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  plan_id uuid not null references public.saas_plans(id) on delete restrict,
  provider text not null check (provider in ('mercado_pago')),
  payment_method text not null check (payment_method in ('pix', 'card')),
  provider_payment_id text,
  provider_subscription_id text,
  external_reference text not null unique,
  idempotency_key uuid not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'BRL',
  status text not null default 'creating'
    check (status in ('creating', 'pending', 'paid', 'failed', 'expired', 'refunded')),
  checkout_url text,
  provider_status_detail text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index saas_billing_invoices_provider_payment_idx
  on public.saas_billing_invoices (provider, provider_payment_id)
  where provider_payment_id is not null;

create index saas_billing_invoices_tenant_created_idx
  on public.saas_billing_invoices (tenant_id, created_at desc);

create index saas_billing_invoices_subscription_idx
  on public.saas_billing_invoices (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create trigger saas_billing_invoices_set_updated_at
before update on public.saas_billing_invoices
for each row execute function public.set_updated_at();

alter table public.saas_billing_invoices enable row level security;

create policy saas_billing_invoices_select_same_tenant
on public.saas_billing_invoices for select
to authenticated
using (tenant_id = public.current_tenant_id());

revoke all on public.saas_billing_invoices from anon, authenticated;
grant select on public.saas_billing_invoices to authenticated;
grant all on public.saas_billing_invoices to service_role;

-- Processa uma confirmacao de pagamento em uma unica transacao. O evento e
-- registrado antes da mudanca de plano; repeticoes do mesmo webhook viram
-- no-op e nunca concedem meses duplicados.
create or replace function public.process_mercado_pago_payment(
  p_provider_payment_id text,
  p_external_reference text,
  p_provider_subscription_id text,
  p_provider_status text,
  p_status_detail text,
  p_amount_cents bigint,
  p_currency text,
  p_payment_method text,
  p_paid_at timestamptz,
  p_payload_hash text,
  p_signature_valid boolean
)
returns table(tenant_id uuid, applied boolean, subscription_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.saas_billing_invoices%rowtype;
  v_event_id uuid;
  v_event_key text;
  v_invoice_status text;
  v_payment_invoice_id uuid;
  v_period_start timestamptz := coalesce(p_paid_at, now());
begin
  if nullif(btrim(p_provider_payment_id), '') is null then
    raise exception 'Identificador de pagamento ausente';
  end if;

  if p_provider_status not in (
    'approved', 'authorized', 'pending', 'in_process', 'rejected',
    'cancelled', 'refunded', 'charged_back'
  ) then
    raise exception 'Status de pagamento nao suportado';
  end if;

  select invoice.*
  into v_invoice
  from public.saas_billing_invoices invoice
  where invoice.provider = 'mercado_pago'
    and (
      invoice.provider_payment_id = p_provider_payment_id
      or invoice.external_reference = nullif(btrim(p_external_reference), '')
      or (
        nullif(btrim(p_provider_subscription_id), '') is not null
        and invoice.provider_subscription_id = p_provider_subscription_id
      )
    )
  order by
    case when invoice.provider_payment_id = p_provider_payment_id then 0 else 1 end,
    invoice.created_at
  limit 1
  for update;

  if v_invoice.id is null then
    raise exception 'Fatura correspondente nao encontrada';
  end if;

  v_event_key := 'payment:' || p_provider_payment_id || ':' || p_provider_status;
  insert into public.webhook_events (
    tenant_id,
    provider,
    provider_event_id,
    event_type,
    payload_hash,
    signature_valid,
    status,
    attempts
  )
  values (
    v_invoice.tenant_id,
    'mercado_pago',
    v_event_key,
    'payment.' || p_provider_status,
    p_payload_hash,
    p_signature_valid,
    'received',
    1
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return query select v_invoice.tenant_id, false, subscription.status
    from public.tenant_subscriptions subscription
    where subscription.tenant_id = v_invoice.tenant_id;
    return;
  end if;

  if p_provider_status = 'approved' then
    if p_amount_cents <> v_invoice.amount_cents
      or upper(coalesce(p_currency, '')) <> upper(v_invoice.currency::text) then
      update public.webhook_events
      set status = 'failed',
          last_error = 'Valor ou moeda nao conferem com a fatura',
          processed_at = now()
      where id = v_event_id;
      raise exception 'Valor ou moeda do pagamento nao conferem';
    end if;
    v_invoice_status := 'paid';
  elsif p_provider_status in ('refunded', 'charged_back') then
    v_invoice_status := 'refunded';
  elsif p_provider_status in ('rejected', 'cancelled') then
    v_invoice_status := 'failed';
  else
    v_invoice_status := 'pending';
  end if;

  if v_invoice.provider_payment_id is null
    or v_invoice.provider_payment_id = p_provider_payment_id then
    update public.saas_billing_invoices
    set provider_payment_id = p_provider_payment_id,
        provider_subscription_id = coalesce(
          nullif(btrim(p_provider_subscription_id), ''),
          provider_subscription_id
        ),
        status = v_invoice_status,
        provider_status_detail = nullif(btrim(p_status_detail), ''),
        paid_at = case when v_invoice_status = 'paid' then v_period_start else paid_at end
    where id = v_invoice.id
    returning id into v_payment_invoice_id;
  else
    insert into public.saas_billing_invoices (
      tenant_id,
      plan_id,
      provider,
      payment_method,
      provider_payment_id,
      provider_subscription_id,
      external_reference,
      idempotency_key,
      amount_cents,
      currency,
      status,
      provider_status_detail,
      paid_at
    )
    values (
      v_invoice.tenant_id,
      v_invoice.plan_id,
      'mercado_pago',
      case when p_payment_method = 'pix' then 'pix' else 'card' end,
      p_provider_payment_id,
      nullif(btrim(p_provider_subscription_id), ''),
      'mp-payment:' || p_provider_payment_id,
      gen_random_uuid(),
      v_invoice.amount_cents,
      v_invoice.currency,
      v_invoice_status,
      nullif(btrim(p_status_detail), ''),
      case when v_invoice_status = 'paid' then v_period_start else null end
    )
    on conflict (provider, provider_payment_id) where provider_payment_id is not null
    do update set
      status = excluded.status,
      provider_status_detail = excluded.provider_status_detail,
      paid_at = coalesce(excluded.paid_at, public.saas_billing_invoices.paid_at),
      updated_at = now()
    returning id into v_payment_invoice_id;
  end if;

  if v_invoice_status = 'paid' then
    insert into public.tenant_subscriptions (
      tenant_id,
      plan_id,
      provider,
      provider_subscription_id,
      status,
      current_period_start,
      current_period_end,
      trial_ends_at,
      cancelled_at
    )
    values (
      v_invoice.tenant_id,
      v_invoice.plan_id,
      'mercado_pago',
      nullif(btrim(p_provider_subscription_id), ''),
      'active',
      v_period_start,
      v_period_start + interval '1 month',
      null,
      null
    )
    on conflict (tenant_id) do update
    set plan_id = excluded.plan_id,
        provider = excluded.provider,
        provider_subscription_id = coalesce(
          excluded.provider_subscription_id,
          public.tenant_subscriptions.provider_subscription_id
        ),
        status = 'active',
        current_period_start = v_period_start,
        current_period_end = greatest(
          coalesce(public.tenant_subscriptions.current_period_end, v_period_start),
          v_period_start
        ) + interval '1 month',
        trial_ends_at = null,
        cancelled_at = null,
        updated_at = now();
  elsif v_invoice_status = 'refunded' and not exists (
    select 1
    from public.saas_billing_invoices later_invoice
    where later_invoice.tenant_id = v_invoice.tenant_id
      and later_invoice.status = 'paid'
      and later_invoice.paid_at > coalesce(v_invoice.paid_at, '-infinity'::timestamptz)
  ) then
    update public.tenant_subscriptions
    set status = 'past_due', updated_at = now()
    where tenant_subscriptions.tenant_id = v_invoice.tenant_id;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    v_invoice.tenant_id,
    null,
    'billing.payment_' || p_provider_status,
    'saas_billing_invoice',
    v_payment_invoice_id::text,
    jsonb_build_object(
      'provider', 'mercado_pago',
      'payment_method', p_payment_method,
      'amount_cents', p_amount_cents,
      'currency', p_currency,
      'signature_valid', p_signature_valid
    )
  );

  update public.webhook_events
  set status = 'processed', processed_at = now()
  where id = v_event_id;

  return query select v_invoice.tenant_id, true, subscription.status
  from public.tenant_subscriptions subscription
  where subscription.tenant_id = v_invoice.tenant_id;
end;
$$;

revoke all on function public.process_mercado_pago_payment(
  text, text, text, text, text, bigint, text, text, timestamptz, text, boolean
) from public, anon, authenticated;
grant execute on function public.process_mercado_pago_payment(
  text, text, text, text, text, bigint, text, text, timestamptz, text, boolean
) to service_role;

-- Eventos da autorizacao recorrente vinculam o contrato do Mercado Pago ao
-- tenant. A autorizacao sozinha nao libera o plano: a liberacao depende do
-- webhook de pagamento aprovado acima.
create or replace function public.process_mercado_pago_subscription(
  p_provider_subscription_id text,
  p_external_reference text,
  p_provider_status text,
  p_payload_hash text,
  p_signature_valid boolean
)
returns table(tenant_id uuid, applied boolean, subscription_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.saas_billing_invoices%rowtype;
  v_event_id uuid;
  v_event_key text;
begin
  if nullif(btrim(p_provider_subscription_id), '') is null then
    raise exception 'Identificador de assinatura ausente';
  end if;

  if p_provider_status not in ('pending', 'authorized', 'paused', 'cancelled') then
    raise exception 'Status de assinatura nao suportado';
  end if;

  select invoice.*
  into v_invoice
  from public.saas_billing_invoices invoice
  where invoice.provider = 'mercado_pago'
    and (
      invoice.provider_subscription_id = p_provider_subscription_id
      or invoice.external_reference = nullif(btrim(p_external_reference), '')
    )
  order by invoice.created_at
  limit 1
  for update;

  if v_invoice.id is null then
    raise exception 'Fatura correspondente nao encontrada';
  end if;

  v_event_key := 'preapproval:' || p_provider_subscription_id || ':' || p_provider_status;
  insert into public.webhook_events (
    tenant_id,
    provider,
    provider_event_id,
    event_type,
    payload_hash,
    signature_valid,
    status,
    attempts
  )
  values (
    v_invoice.tenant_id,
    'mercado_pago',
    v_event_key,
    'subscription.' || p_provider_status,
    p_payload_hash,
    p_signature_valid,
    'received',
    1
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return query select v_invoice.tenant_id, false, subscription.status
    from public.tenant_subscriptions subscription
    where subscription.tenant_id = v_invoice.tenant_id;
    return;
  end if;

  update public.saas_billing_invoices
  set provider_subscription_id = p_provider_subscription_id,
      status = case
        when p_provider_status = 'cancelled' then 'failed'
        else status
      end,
      provider_status_detail = p_provider_status
  where id = v_invoice.id;

  update public.tenant_subscriptions
  set provider = 'mercado_pago',
      provider_subscription_id = p_provider_subscription_id,
      status = case
        when p_provider_status = 'paused' then 'past_due'
        when p_provider_status = 'cancelled' then 'cancelled'
        else status
      end,
      cancelled_at = case when p_provider_status = 'cancelled' then now() else cancelled_at end,
      updated_at = now()
  where tenant_subscriptions.tenant_id = v_invoice.tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    v_invoice.tenant_id,
    null,
    'billing.subscription_' || p_provider_status,
    'tenant_subscription',
    v_invoice.tenant_id::text,
    jsonb_build_object(
      'provider', 'mercado_pago',
      'provider_subscription_id', p_provider_subscription_id,
      'signature_valid', p_signature_valid
    )
  );

  update public.webhook_events
  set status = 'processed', processed_at = now()
  where id = v_event_id;

  return query select v_invoice.tenant_id, true, subscription.status
  from public.tenant_subscriptions subscription
  where subscription.tenant_id = v_invoice.tenant_id;
end;
$$;

revoke all on function public.process_mercado_pago_subscription(
  text, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.process_mercado_pago_subscription(
  text, text, text, text, boolean
) to service_role;

commit;
