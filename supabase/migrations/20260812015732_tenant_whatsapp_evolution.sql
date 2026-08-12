begin;

-- Cada empresa possui uma instancia Evolution API propria. Credenciais do
-- provedor permanecem somente no ambiente do servidor; o banco guarda apenas
-- identificadores operacionais e o numero que deve ser conectado.
create table public.tenant_whatsapp_connections (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  provider text not null default 'evolution_api'
    check (provider = 'evolution_api'),
  instance_name text not null unique
    check (instance_name ~ '^cp_[0-9a-f]{32}$'),
  registered_number text not null
    check (registered_number ~ '^55[1-9][0-9]{9,10}$'),
  connected_number text
    check (
      connected_number is null
      or connected_number ~ '^55[1-9][0-9]{9,10}$'
    ),
  status text not null default 'pending'
    check (status in (
      'pending', 'connecting', 'open', 'close', 'mismatch', 'error'
    )),
  last_error text check (last_error is null or length(last_error) <= 500),
  last_checked_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tenant_whatsapp_connections_status_idx
  on public.tenant_whatsapp_connections (status, last_checked_at);

create trigger tenant_whatsapp_connections_set_updated_at
before update on public.tenant_whatsapp_connections
for each row execute function public.set_updated_at();

alter table public.tenant_whatsapp_connections enable row level security;

create policy tenant_whatsapp_connections_select_admin
on public.tenant_whatsapp_connections for select
to authenticated
using (
  (
    tenant_id = (select public.current_tenant_id())
    and (select public.can_manage_tenant())
  )
  or (select public.is_super_admin())
);

revoke all on table public.tenant_whatsapp_connections
  from public, anon, authenticated;
grant select on table public.tenant_whatsapp_connections to authenticated;

-- Reserva uma mensagem e o limite do plano na mesma transacao. A funcao roda
-- com os privilegios do chamador e so pode ser executada pela service role.
create or replace function public.reserve_whatsapp_notification(
  p_tenant_id uuid,
  p_client_id uuid,
  p_recipient text,
  p_template_key text,
  p_payload jsonb,
  p_idempotency_key text,
  p_category text
)
returns table(notification_id uuid, notification_status text, already_existed boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.tenant_subscriptions%rowtype;
  v_limit bigint;
  v_usage bigint;
  v_existing public.notifications%rowtype;
  v_notification_id uuid;
begin
  if p_tenant_id is null
    or p_recipient !~ '^\+[1-9][0-9]{9,14}$'
    or length(coalesce(p_template_key, '')) not between 1 and 80
    or length(coalesce(p_idempotency_key, '')) not between 8 and 200
    or length(coalesce(p_category, '')) not between 1 and 40
  then
    raise exception 'Dados da mensagem invalidos';
  end if;

  select *
  into v_existing
  from public.notifications
  where tenant_id = p_tenant_id
    and idempotency_key = p_idempotency_key;

  if v_existing.id is not null then
    return query select v_existing.id, v_existing.status, true;
    return;
  end if;

  select subscription.*
  into v_subscription
  from public.tenant_subscriptions subscription
  where subscription.tenant_id = p_tenant_id
  for update;

  -- Outra requisicao pode ter reservado a mesma chave enquanto aguardavamos
  -- o bloqueio da assinatura. Revalidamos dentro da secao serializada.
  select *
  into v_existing
  from public.notifications
  where tenant_id = p_tenant_id
    and idempotency_key = p_idempotency_key;

  if v_existing.id is not null then
    return query select v_existing.id, v_existing.status, true;
    return;
  end if;

  if v_subscription.id is null
    or v_subscription.status not in ('active', 'trialing')
  then
    raise exception 'Assinatura sem acesso ao WhatsApp';
  end if;

  select plan_limit.limit_value
  into v_limit
  from public.saas_plan_limits plan_limit
  where plan_limit.plan_id = v_subscription.plan_id
    and plan_limit.limit_key = 'whatsapp_messages';

  if coalesce(v_limit, 0) <= 0 then
    raise exception 'Seu plano nao inclui mensagens de WhatsApp';
  end if;

  select count(*)
  into v_usage
  from public.notifications notification
  where notification.tenant_id = p_tenant_id
    and notification.channel = 'whatsapp'
    and notification.created_at >= date_trunc('month', now())
    and notification.status <> 'cancelled';

  if v_usage >= v_limit then
    raise exception 'Limite mensal de mensagens do WhatsApp atingido';
  end if;

  insert into public.notifications (
    tenant_id,
    client_id,
    channel,
    template_key,
    payload,
    status,
    idempotency_key,
    scheduled_for,
    category,
    recipient,
    attempts
  )
  values (
    p_tenant_id,
    p_client_id,
    'whatsapp',
    p_template_key,
    coalesce(p_payload, '{}'::jsonb),
    'queued',
    p_idempotency_key,
    now(),
    p_category,
    p_recipient,
    0
  )
  returning id into v_notification_id;

  return query select v_notification_id, 'queued'::text, false;
end;
$$;

revoke all on function public.reserve_whatsapp_notification(
  uuid, uuid, text, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.reserve_whatsapp_notification(
  uuid, uuid, text, text, jsonb, text, text
) to service_role;

commit;
