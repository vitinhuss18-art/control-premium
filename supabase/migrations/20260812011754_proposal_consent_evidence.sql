begin;

-- A proposta ainda não é o contrato financeiro final. Esta tabela preserva
-- a evidência do aceite eletrônico usado para enviar dados e documentos para
-- análise, incluindo a versão e o hash exato do texto mostrado ao signatário.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_proposals_tenant_id_id_key'
      and conrelid = 'public.client_proposals'::regclass
  ) then
    alter table public.client_proposals
      add constraint client_proposals_tenant_id_id_key
      unique (tenant_id, id);
  end if;
end;
$$;

create table public.proposal_consent_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  proposal_id uuid not null,
  consent_version text not null
    check (length(consent_version) between 1 and 80),
  consent_sha256 char(64) not null
    check (consent_sha256 ~ '^[0-9a-f]{64}$'),
  signer_name text not null
    check (length(trim(signer_name)) between 3 and 120),
  signer_cpf text not null
    check (signer_cpf ~ '^[0-9]{11}$'),
  acceptance_method text not null
    check (acceptance_method in ('typed_name_checkbox')),
  accepted_at timestamptz not null default now(),
  ip_hash char(64)
    check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or length(user_agent) <= 512),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint proposal_consent_evidence_proposal_key unique (proposal_id),
  constraint proposal_consent_evidence_request_key unique (request_id),
  constraint proposal_consent_evidence_same_tenant_proposal_fkey
    foreign key (tenant_id, proposal_id)
    references public.client_proposals (tenant_id, id)
    on delete restrict
);

create index proposal_consent_evidence_tenant_accepted_idx
  on public.proposal_consent_evidence (tenant_id, accepted_at desc);

alter table public.proposal_consent_evidence enable row level security;

create policy proposal_consent_evidence_select_staff
on public.proposal_consent_evidence for select
to authenticated
using (
  (
    tenant_id = (select public.current_tenant_id())
    and (select public.has_staff_role())
  )
  or (select public.is_super_admin())
);

revoke all on table public.proposal_consent_evidence
  from public, anon, authenticated;
grant select on table public.proposal_consent_evidence to authenticated;

create or replace function public.prevent_proposal_consent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Evidência de aceite é imutável';
end;
$$;

revoke all on function public.prevent_proposal_consent_mutation()
  from public, anon, authenticated;

create trigger proposal_consent_evidence_immutable
before update or delete on public.proposal_consent_evidence
for each row execute function public.prevent_proposal_consent_mutation();

create or replace function public.submit_client_proposal_with_consent(
  p_token text,
  p_proposal_id uuid,
  p_full_name text,
  p_cpf text,
  p_instagram text,
  p_pix_key text,
  p_whatsapp text,
  p_sms text,
  p_address text,
  p_region text,
  p_loan_amount_cents integer,
  p_consent_version text,
  p_consent_sha256 text,
  p_signer_name text,
  p_ip_hash text,
  p_user_agent text,
  p_request_id uuid
)
returns table(proposal_id uuid, tenant_id uuid, link_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.client_signup_links%rowtype;
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_sms text := regexp_replace(coalesce(p_sms, ''), '\D', '', 'g');
  v_full_name text := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_signer_name text := regexp_replace(trim(coalesce(p_signer_name, '')), '\s+', ' ', 'g');
begin
  if p_proposal_id is null
    or p_request_id is null
    or nullif(trim(p_token), '') is null
  then
    raise exception 'Link ou identificação da requisição inválidos';
  end if;

  if length(v_full_name) not between 3 and 120
    or length(v_cpf) <> 11
    or length(v_whatsapp) not between 10 and 15
    or (v_sms <> '' and length(v_sms) not between 10 and 15)
    or length(trim(coalesce(p_address, ''))) not between 1 and 500
    or length(trim(coalesce(p_region, ''))) not between 1 and 100
    or length(coalesce(p_instagram, '')) > 100
    or length(coalesce(p_pix_key, '')) > 200
    or p_loan_amount_cents is null
    or p_loan_amount_cents <= 0
  then
    raise exception 'Dados da proposta inválidos';
  end if;

  if p_consent_version <> 'proposal-consent-v1-2026-08-11'
    or lower(coalesce(p_consent_sha256, '')) <>
      '485e0579d223d816b17952e9679b249103fa7be38b425d90756a893fdd8d67f6'
    or lower(v_signer_name) <> lower(v_full_name)
    or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$')
    or length(coalesce(p_user_agent, '')) > 512
  then
    raise exception 'Aceite eletrônico inválido';
  end if;

  select *
  into v_link
  from public.client_signup_links
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and active = true
  for update;

  if v_link.id is null then
    raise exception 'Link inválido, expirado ou já utilizado';
  end if;

  insert into public.client_proposals (
    id,
    tenant_id,
    signup_link_id,
    full_name,
    cpf,
    instagram,
    pix_key,
    whatsapp,
    sms,
    address,
    region,
    loan_amount_cents,
    status
  )
  values (
    p_proposal_id,
    v_link.tenant_id,
    v_link.id,
    v_full_name,
    v_cpf,
    nullif(trim(coalesce(p_instagram, '')), ''),
    nullif(trim(coalesce(p_pix_key, '')), ''),
    v_whatsapp,
    nullif(v_sms, ''),
    trim(p_address),
    trim(p_region),
    p_loan_amount_cents,
    'pending'
  );

  insert into public.proposal_consent_evidence (
    tenant_id,
    proposal_id,
    consent_version,
    consent_sha256,
    signer_name,
    signer_cpf,
    acceptance_method,
    ip_hash,
    user_agent,
    request_id
  )
  values (
    v_link.tenant_id,
    p_proposal_id,
    p_consent_version,
    lower(p_consent_sha256),
    v_signer_name,
    v_cpf,
    'typed_name_checkbox',
    p_ip_hash,
    nullif(p_user_agent, ''),
    p_request_id
  );

  update public.client_signup_links
  set active = false,
      revoked_at = now()
  where id = v_link.id;

  return query select p_proposal_id, v_link.tenant_id, v_link.id;
end;
$$;

revoke all on function public.submit_client_proposal_with_consent(
  text, uuid, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.submit_client_proposal_with_consent(
  text, uuid, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, uuid
) to anon;

commit;
