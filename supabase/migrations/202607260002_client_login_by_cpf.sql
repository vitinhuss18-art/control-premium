begin;

-- Remove a versão inicial insegura, caso já tenha sido aplicada.
drop function if exists public.client_login_by_cpf(text);

-- O cliente informa CPF e os quatro últimos dígitos do WhatsApp cadastrado.
-- A resposta permanece mínima e não revela telefone, endereço, PIX ou documentos.
create or replace function public.client_login_by_cpf(
  p_cpf text,
  p_phone_last4 text
)
returns table(client_id uuid, full_name text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf_digits text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone_last4 text := regexp_replace(coalesce(p_phone_last4, ''), '\D', '', 'g');
  v_match_count integer;
begin
  if length(v_cpf_digits) <> 11 or length(v_phone_last4) <> 4 then
    return;
  end if;

  select count(*)
  into v_match_count
  from public.clients c
  where c.cpf = v_cpf_digits
    and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 4) = v_phone_last4;

  -- Não escolhe um tenant arbitrariamente quando as credenciais são ambíguas.
  if v_match_count <> 1 then
    return;
  end if;

  return query
    select c.id, c.full_name, c.status
    from public.clients c
    where c.cpf = v_cpf_digits
      and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 4) = v_phone_last4
    limit 1;
end;
$$;

revoke all on function public.client_login_by_cpf(text, text) from public;
grant execute on function public.client_login_by_cpf(text, text) to anon, authenticated;

commit;
