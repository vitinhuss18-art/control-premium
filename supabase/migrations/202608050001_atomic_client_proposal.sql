begin;

-- Registra a proposta e desativa o link de convite na mesma transação. O
-- bloqueio FOR UPDATE garante que duas requisições concorrentes não consigam
-- consumir o mesmo convite.
create or replace function public.submit_client_proposal(
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
  p_loan_amount_cents integer
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
begin
  if p_proposal_id is null or nullif(trim(p_token), '') is null then
    raise exception 'Link inválido';
  end if;
  if length(trim(coalesce(p_full_name, ''))) not between 3 and 120
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
    trim(p_full_name),
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

  update public.client_signup_links
  set active = false,
      revoked_at = now()
  where id = v_link.id;

  return query select p_proposal_id, v_link.tenant_id, v_link.id;
end;
$$;

revoke all on function public.submit_client_proposal(
  text, uuid, text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.submit_client_proposal(
  text, uuid, text, text, text, text, text, text, text, text, integer
) to anon;

commit;
