begin;

-- Login do cliente é só por CPF (sem senha), como já era no protótipo.
-- Por isso essa função é aberta para "anon" também: o cliente nunca faz
-- login de verdade no Supabase Auth, só informa o CPF.
--
-- Limitação de segurança conhecida e aceita para este estágio do produto:
-- qualquer pessoa que souber um CPF cadastrado consegue ver nome e status
-- (não devolve telefone, endereço, PIX nem nenhum outro dado sensível).
-- Uma evolução futura (fora do escopo desta etapa) seria exigir também
-- algo que só o cliente saiba (últimos dígitos do telefone, por exemplo).
create or replace function public.client_login_by_cpf(p_cpf text)
returns table(client_id uuid, tenant_id uuid, full_name text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf_digits text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  if length(v_cpf_digits) <> 11 then
    raise exception 'CPF inválido';
  end if;

  return query
    select c.id, c.tenant_id, c.full_name, c.status
    from public.clients c
    where c.cpf = v_cpf_digits
    limit 1;
end;
$$;

grant execute on function public.client_login_by_cpf(text) to anon, authenticated;

commit;
