begin;

-- Permite ao admin cancelar um emprestimo criado com dados errados (ex: juros
-- configurados errado). Nao apaga nada -- so marca o emprestimo e as
-- parcelas ainda nao pagas como cancelled, preservando o historico. Parcelas
-- que ja tiverem pagamento registrado NAO sao canceladas (protege dinheiro
-- que o cliente ja pagou de verdade).
create or replace function public.cancel_loan(p_loan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from public.loans
  where id = p_loan_id;

  if v_tenant_id is null then
    raise exception 'Empréstimo não encontrado.';
  end if;

  if v_tenant_id <> public.current_tenant_id() or not public.has_staff_role() then
    raise exception 'Sem permissão para cancelar este empréstimo.';
  end if;

  update public.installments
  set status = 'cancelled'
  where loan_id = p_loan_id
    and paid_cents = 0
    and status <> 'cancelled';

  update public.loans
  set status = 'cancelled'
  where id = p_loan_id;
end;
$$;

revoke all on function public.cancel_loan(uuid) from public;
grant execute on function public.cancel_loan(uuid) to authenticated;

commit;
