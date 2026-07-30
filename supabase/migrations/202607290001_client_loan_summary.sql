begin;

-- O login do cliente (client_login_by_cpf) NAO cria uma sessao real do
-- Supabase Auth -- e so uma verificacao de CPF+4 ultimos digitos do
-- whatsapp que devolve os dados basicos. Por isso o app nunca conseguia
-- buscar os emprestimos/parcelas do cliente depois do login: qualquer
-- select direto em public.loans/installments roda como "anon" pra ele, e a
-- RLS (loans_select_staff, installments_select_staff) exige tenant_id +
-- has_staff_role(), que um cliente nunca tem. Resultado: painel do cliente
-- ficava so com um texto de status generico, sem valor do emprestimo nem
-- parcelas.
--
-- Esta funcao resolve isso do mesmo jeito que client_login_by_cpf: security
-- definer, revalidando CPF+telefone a cada chamada (nao so confia no
-- client_id vindo do front, pra ninguem conseguir ver emprestimo de outro
-- cliente so adivinhando o uuid).
create or replace function public.client_loan_summary(
  p_client_id uuid,
  p_cpf text,
  p_phone_last4 text
)
returns table(
  loan_id uuid,
  operation_type text,
  loan_principal_cents bigint,
  loan_status text,
  loan_created_at timestamptz,
  installment_id uuid,
  sequence_number integer,
  due_date date,
  installment_status text,
  principal_cents bigint,
  interest_cents bigint,
  fee_cents bigint,
  paid_cents bigint,
  tenant_display_name text,
  tenant_whatsapp text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf_digits text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone_last4 text := regexp_replace(coalesce(p_phone_last4, ''), '\D', '', 'g');
  v_match_count integer;
begin
  if p_client_id is null or length(v_cpf_digits) <> 11 or length(v_phone_last4) <> 4 then
    return;
  end if;

  select count(*)
  into v_match_count
  from public.clients c
  where c.id = p_client_id
    and c.cpf = v_cpf_digits
    and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 4) = v_phone_last4;

  if v_match_count <> 1 then
    return;
  end if;

  return query
    select
      l.id, l.operation_type, l.principal_cents, l.status, l.created_at,
      i.id, i.sequence_number, i.due_date, i.status,
      i.principal_cents, i.interest_cents, i.fee_cents, i.paid_cents,
      t.display_name, t.whatsapp_business_number
    from public.loans l
    join public.clients c on c.id = l.client_id
    join public.tenants t on t.id = l.tenant_id
    left join public.installments i on i.loan_id = l.id
    where l.client_id = p_client_id
    order by l.created_at desc, i.sequence_number asc nulls last;
end;
$$;

revoke all on function public.client_loan_summary(uuid, text, text) from public;
grant execute on function public.client_loan_summary(uuid, text, text) to anon, authenticated;

commit;
