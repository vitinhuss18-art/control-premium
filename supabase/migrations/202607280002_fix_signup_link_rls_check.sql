begin;

-- BUG encontrado em 28/07/2026: a policy client_proposals_insert_anon
-- (migration 202607250005) faz "exists (select 1 from client_signup_links
-- l where ...)" dentro do WITH CHECK. Só que client_signup_links tem RLS
-- ligado (migration 202607250002) e nenhuma policy de select libera o role
-- anon -- so libera quando current_tenant_id()/can_manage_tenant() sao
-- verdadeiros, o que nunca acontece pra um visitante anonimo preenchendo o
-- formulario de cadastro. Resultado: a subquery sempre via zero linhas pro
-- anon, o EXISTS sempre dava falso, e TODA proposta anonima era barrada
-- pela RLS -- mesmo com o link certinho e ativo. Nunca funcionou de
-- verdade desde que a migration 250005 foi aplicada.
--
-- Corrigido trocando a subquery direta por uma funcao security definer:
-- ela roda com o privilegio do dono da funcao (ignora RLS internamente),
-- mas so devolve um boolean -- nao abre nenhuma coluna de
-- client_signup_links pro anon, ao contrario de criar uma policy de select
-- ampla (que exporia o token/hash do link pra qualquer um).

create or replace function public.signup_link_is_active(
  p_link_id uuid,
  p_tenant_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_signup_links l
    where l.id = p_link_id
      and l.tenant_id = p_tenant_id
      and l.active = true
  );
$$;

revoke all on function public.signup_link_is_active(uuid, uuid) from public;
grant execute on function public.signup_link_is_active(uuid, uuid)
  to anon, authenticated;

drop policy if exists client_proposals_insert_anon on public.client_proposals;
create policy client_proposals_insert_anon
on public.client_proposals for insert
to anon, authenticated
with check (
  status = 'pending'
  and signup_link_id is not null
  and public.signup_link_is_active(signup_link_id, tenant_id)
);

commit;
