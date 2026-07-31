begin;

-- Uma pessoa pode enviar uma nova proposta pelo link mesmo quando já possui
-- cadastro no tenant. Nesse caso, a aprovação deve reutilizar o cliente
-- existente em vez de violar a chave única (tenant_id, cpf).
create or replace function public.decide_client_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_frequency text default null,
  p_installment_count integer default null,
  p_periodic_interest_bps integer default null,
  p_review_note text default null
)
returns table(client_id uuid, full_name text, cpf text, whatsapp text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_proposal public.client_proposals%rowtype;
  v_client_id uuid;
  v_client_metadata jsonb;
begin
  if auth.uid() is null or not public.role_has_permission('proposals.approve') then
    raise exception 'Permissão negada para decidir propostas';
  end if;

  v_tenant_id := public.current_tenant_id();

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decisão inválida';
  end if;

  select *
  into v_proposal
  from public.client_proposals
  where id = p_proposal_id
    and tenant_id = v_tenant_id
    and status = 'pending'
  for update;

  if v_proposal.id is null then
    raise exception 'Proposta não encontrada ou já decidida';
  end if;

  if p_decision = 'approved' then
    if p_frequency is null or p_installment_count is null or p_installment_count <= 0
      or p_periodic_interest_bps is null
    then
      raise exception 'Defina frequência, número de parcelas e juros para aprovar';
    end if;

    v_client_metadata := jsonb_strip_nulls(jsonb_build_object(
      'instagram', v_proposal.instagram,
      'chave_pix', v_proposal.pix_key,
      'sms', v_proposal.sms,
      'endereco', v_proposal.address,
      'regiao', v_proposal.region
    ));

    insert into public.clients (
      tenant_id, full_name, cpf, phone, status, metadata
    )
    values (
      v_tenant_id,
      v_proposal.full_name,
      v_proposal.cpf,
      v_proposal.whatsapp,
      'approved',
      v_client_metadata
    )
    on conflict (tenant_id, cpf) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        status = case
          when public.clients.status = 'blocked' then public.clients.status
          else 'approved'
        end,
        metadata = coalesce(public.clients.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now()
    returning public.clients.id into v_client_id;
  end if;

  update public.client_proposals
  set status = p_decision,
      client_id = v_client_id,
      frequency = p_frequency,
      installment_count = p_installment_count,
      periodic_interest_bps = p_periodic_interest_bps,
      review_note = p_review_note,
      reviewer_id = auth.uid(),
      reviewed_at = now()
  where id = p_proposal_id;

  insert into public.audit_logs (
    tenant_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    v_tenant_id,
    auth.uid(),
    'proposal.decided',
    'client_proposal',
    p_proposal_id::text,
    jsonb_build_object('decision', p_decision, 'client_id', v_client_id)
  );

  return query
    select v_client_id, v_proposal.full_name, v_proposal.cpf, v_proposal.whatsapp;
end;
$$;

revoke all on function public.decide_client_proposal(
  uuid, text, text, integer, integer, text
) from public;
grant execute on function public.decide_client_proposal(
  uuid, text, text, integer, integer, text
) to authenticated;

commit;
