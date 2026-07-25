begin;

-- A validação anterior só retornava o tenant_id, então a política de inserção
-- não tinha como confirmar que a proposta realmente veio de um link válido —
-- qualquer pessoa com a chave anônima (pública, por natureza) podia inserir
-- uma "proposta" direto na tabela, sem token nenhum. Agora a função também
-- devolve o id do link, para ser referenciado e checado na própria política.
-- O tipo de retorno mudou (de uuid para uma tabela), então o Postgres exige
-- apagar a função antiga antes de recriar.
drop function if exists public.validate_signup_link_token(text);

create function public.validate_signup_link_token(p_token text)
returns table(tenant_id uuid, link_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.client_signup_links%rowtype;
begin
  if nullif(trim(p_token), '') is null then
    raise exception 'Token inválido';
  end if;

  select *
  into v_link
  from public.client_signup_links
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and active = true;

  if v_link.id is null then
    raise exception 'Link inválido ou expirado';
  end if;

  return query select v_link.tenant_id, v_link.id;
end;
$$;

drop policy if exists client_proposals_insert_anon on public.client_proposals;
create policy client_proposals_insert_anon
on public.client_proposals for insert
to anon, authenticated
with check (
  status = 'pending'
  and signup_link_id is not null
  and exists (
    select 1
    from public.client_signup_links l
    where l.id = client_proposals.signup_link_id
      and l.tenant_id = client_proposals.tenant_id
      and l.active = true
  )
);

-- O upload de fotos acontece no servidor com a service_role key, que já
-- ignora RLS por padrão — essa política extra só servia pra abrir uma porta
-- desnecessária para qualquer pessoa (anon/authenticated) subir arquivos
-- livremente na pasta de qualquer empresa. Removendo.
drop policy if exists client_documents_insert_service on storage.objects;

commit;
