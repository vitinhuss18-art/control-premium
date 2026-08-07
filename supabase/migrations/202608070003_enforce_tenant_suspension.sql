begin;

-- A coluna tenants.status ('active' | 'suspended' | 'archived') existe desde
-- a fundacao (202607240001) mas nunca era checada em lugar nenhum -- nem no
-- login, nem na RLS. O botao "Suspender" do painel do dono (adicionado em
-- 202608070002) ficaria so mudando essa coluna sem nenhum efeito real. Esta
-- migration faz current_tenant_id(), has_any_role() e role_has_permission()
-- -- os tres gatekeepers usados por praticamente toda a RLS e pelas RPCs do
-- staff (admin/operador/cobrador) -- exigirem tenant ativo. super_admin
-- (tenant_id null) nunca e afetado. O portal do cliente final (login por
-- CPF, client_login_by_cpf/client_loan_summary, que roda com service role e
-- nao passa por essas funcoes) continua funcionando mesmo com o tenant
-- suspenso -- suspensao bloqueia o painel do assinante, nao o acesso do
-- tomador do emprestimo aos proprios dados.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.active = true
    and (
      p.tenant_id is null
      or exists (
        select 1 from public.tenants t
        where t.id = p.tenant_id and t.status = 'active'
      )
    )
$$;

create or replace function public.has_any_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role = any(allowed_roles)
      and (
        p.tenant_id is null
        or exists (
          select 1 from public.tenants t
          where t.id = p.tenant_id and t.status = 'active'
        )
      )
  )
$$;

create or replace function public.role_has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.role_permissions permission
      on permission.role = profile.role
    where profile.id = auth.uid()
      and profile.active = true
      and (
        permission.permission = '*'
        or permission.permission = required_permission
      )
      and (
        profile.tenant_id is null
        or exists (
          select 1 from public.tenants t
          where t.id = profile.tenant_id and t.status = 'active'
        )
      )
  )
$$;

commit;
