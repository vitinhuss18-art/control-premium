begin;

-- Hoje o link de cadastro (client_signup_links) fica "active = true" para sempre,
-- ou seja, se o cliente encaminhar o link para outra pessoa depois de já ter
-- enviado a proposta dele, essa segunda pessoa ainda consegue usar o mesmo link
-- e mandar outra proposta como se fosse o mesmo convite. Esta migração torna o
-- link de uso único: assim que uma proposta é registrada com sucesso, o link é
-- desativado e não pode mais ser reaproveitado.

-- Chamada pelo servidor (apps/web/src/app/api/cadastro/route.ts) logo após o
-- insert em client_proposals ter sucesso, usando a mesma chave anônima que já
-- validou o token. Só desativa o link se ele ainda estiver ativo (idempotente).
create or replace function public.consume_signup_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_link_id is null then
    return;
  end if;

  update public.client_signup_links
  set active = false,
      revoked_at = now()
  where id = p_link_id
    and active = true;
end;
$$;

revoke all on function public.consume_signup_link(uuid) from public;
grant execute on function public.consume_signup_link(uuid) to anon, authenticated;

commit;
