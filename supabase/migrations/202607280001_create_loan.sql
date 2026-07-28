begin;

-- Ate aqui, nenhuma funcao no banco realmente criava um emprestimo: a tabela
-- credit_proposals nunca recebia insert, e loans exige um proposal_id que
-- vem dela. decide_client_proposal() so cria o registro em clients. Ou seja,
-- o cliente aprovado existia, mas o emprestimo em si nunca nascia de verdade.
--
-- Esta migration cria create_loan_with_installments(): recebe as parcelas ja
-- calculadas (pelo motor testado em packages/domain, chamado a partir de uma
-- rota server-side do apps/web) e persiste tudo atomicamente. A decisao de
-- nao recalcular juros/datas aqui dentro (em SQL) e deliberada -- evita ter
-- duas implementacoes da mesma logica financeira (uma em TypeScript testada,
-- outra em PL/pgSQL nao testada) que podem divergir com o tempo. Ver HANDOFF
-- secao 3 sobre a garantia estrutural "proposta = contrato = parcelas".

-- Sem isso, ninguem (nem o proprio admin do tenant) conseguia ler essas
-- tabelas: RLS estava ligado desde a fundacao, mas sem nenhuma policy de
-- select/insert para credit_proposals, loans, installments ou payments.
create policy credit_proposals_select_staff
on public.credit_proposals for select
using (tenant_id = public.current_tenant_id() and public.has_staff_role());

create policy loans_select_staff
on public.loans for select
using (tenant_id = public.current_tenant_id() and public.has_staff_role());

create policy installments_select_staff
on public.installments for select
using (tenant_id = public.current_tenant_id() and public.has_staff_role());

create policy payments_select_staff
on public.payments for select
using (tenant_id = public.current_tenant_id() and public.has_staff_role());

create or replace function public.create_loan_with_installments(
  p_client_id uuid,
  p_frequency text,
  p_installment_count integer,
  p_periodic_interest_bps integer,
  p_principal_cents bigint,
  p_total_cents bigint,
  p_installments jsonb,
  p_operation_type text default 'loan',
  p_purpose text default null,
  p_product_name text default null,
  p_product_description text default null,
  p_product_photo_path text default null,
  p_sale_price_cents bigint default null,
  p_down_payment_cents bigint default null
)
returns table(loan_id uuid, proposal_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_client_tenant_id uuid;
  v_proposal_id uuid;
  v_loan_id uuid;
  v_item jsonb;
  v_computed_total bigint := 0;
begin
  if auth.uid() is null or not public.role_has_permission('proposals.approve') then
    raise exception 'Permissão negada para criar empréstimos';
  end if;

  v_tenant_id := public.current_tenant_id();

  select tenant_id into v_client_tenant_id
  from public.clients
  where id = p_client_id;

  if v_client_tenant_id is null or v_client_tenant_id <> v_tenant_id then
    raise exception 'Cliente não encontrado neste tenant';
  end if;

  if p_operation_type not in ('loan', 'installment_sale') then
    raise exception 'Tipo de operação inválido';
  end if;

  if p_operation_type = 'installment_sale' and (
    p_product_name is null or p_sale_price_cents is null
  ) then
    raise exception 'Venda parcelada exige nome do produto e valor de venda';
  end if;

  if p_installment_count is null or p_installment_count <= 0 then
    raise exception 'Quantidade de parcelas inválida';
  end if;

  if p_installments is null or jsonb_array_length(p_installments) <> p_installment_count then
    raise exception 'A lista de parcelas não bate com a quantidade informada';
  end if;

  -- soma as parcelas recebidas pra conferir contra o total (principal +
  -- juros) antes de gravar qualquer coisa -- nao confia soh no numero que
  -- veio do cliente. o motor de simulacao (packages/domain) nao separa
  -- principal/juros por parcela, entao cada parcela guarda um valor unico
  -- (amount_cents), gravado na coluna principal_cents de installments com
  -- interest_cents = 0 -- o breakdown agregado fica em calculation_snapshot.
  for v_item in select * from jsonb_array_elements(p_installments)
  loop
    v_computed_total := v_computed_total
      + coalesce((v_item->>'amount_cents')::bigint, 0);
  end loop;

  if v_computed_total <> p_total_cents then
    raise exception 'A soma das parcelas não bate com o valor total informado';
  end if;

  insert into public.credit_proposals (
    tenant_id, client_id, amount_cents, term_count, frequency, purpose,
    status, calculation_snapshot, decided_by, decided_at, created_by,
    operation_type, product_name, product_description, product_photo_path,
    sale_price_cents, down_payment_cents
  )
  values (
    v_tenant_id, p_client_id, p_principal_cents, p_installment_count, p_frequency,
    p_purpose, 'approved',
    jsonb_build_object(
      'principalCents', p_principal_cents,
      'totalCents', p_total_cents,
      'periodicInterestBps', p_periodic_interest_bps,
      'installmentCount', p_installment_count,
      'frequency', p_frequency,
      'installments', p_installments
    ),
    auth.uid(), now(), auth.uid(),
    p_operation_type, p_product_name, p_product_description, p_product_photo_path,
    p_sale_price_cents, p_down_payment_cents
  )
  returning id into v_proposal_id;

  insert into public.loans (
    tenant_id, client_id, proposal_id, principal_cents, status, operation_type
  )
  values (
    v_tenant_id, p_client_id, v_proposal_id, p_principal_cents, 'active', p_operation_type
  )
  returning id into v_loan_id;

  insert into public.installments (
    tenant_id, loan_id, sequence_number, due_date, principal_cents, interest_cents, fee_cents
  )
  select
    v_tenant_id,
    v_loan_id,
    (item->>'sequence_number')::integer,
    (item->>'due_date')::date,
    (item->>'amount_cents')::bigint,
    0,
    0
  from jsonb_array_elements(p_installments) as item;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, details)
  values (
    v_tenant_id, auth.uid(), 'loan.created', 'loan', v_loan_id::text,
    jsonb_build_object('operation_type', p_operation_type, 'principal_cents', p_principal_cents, 'total_cents', p_total_cents)
  );

  return query select v_loan_id, v_proposal_id;
end;
$$;

revoke all on function public.create_loan_with_installments(
  uuid, text, integer, integer, bigint, bigint, jsonb, text, text, text, text, text, bigint, bigint
) from public;
grant execute on function public.create_loan_with_installments(
  uuid, text, integer, integer, bigint, bigint, jsonb, text, text, text, text, text, bigint, bigint
) to authenticated;

commit;
