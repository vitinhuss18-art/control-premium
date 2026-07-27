begin;

-- Promove a conta do dono do sistema (Victor) para super_admin.
-- super_admin já é um papel previsto no schema desde o início (app_role),
-- com bypass de RLS aplicado em quase todas as tabelas -- só faltava alguém
-- usando esse papel e uma tela para aproveitá-lo. O cadastro de assinante
-- (fluxo normal) criou uma empresa (tenant) própria pra essa conta; como
-- super_admin não pertence a nenhuma empresa (tenant_id deve ser null),
-- limpamos esse tenant "órfão" junto.
do $$
declare
  v_owner_id uuid;
  v_old_tenant_id uuid;
begin
  select id into v_owner_id
  from auth.users
  where email = 'adm.vsconsultoria@gmail.com';

  if v_owner_id is null then
    raise exception 'Conta adm.vsconsultoria@gmail.com não encontrada em auth.users';
  end if;

  select tenant_id into v_old_tenant_id
  from public.profiles
  where id = v_owner_id;

  update public.profiles
  set role = 'super_admin',
      tenant_id = null
  where id = v_owner_id;

  if v_old_tenant_id is not null then
    delete from public.tenant_subscriptions where tenant_id = v_old_tenant_id;
    delete from public.tenants where id = v_old_tenant_id;
  end if;
end;
$$;

-- Painel do dono: visão geral de todos os assinantes (tenants), plano,
-- status da assinatura/trial e quantos clientes cada um já cadastrou.
-- Só quem é super_admin pode chamar -- dupla proteção além do RLS, porque
-- essa função roda com security definer (ignora RLS por natureza).
create or replace function public.owner_dashboard_overview()
returns table(
  tenant_id uuid,
  company_name text,
  admin_full_name text,
  admin_email text,
  plan_name text,
  price_cents bigint,
  subscription_status text,
  trial_ends_at timestamptz,
  client_count bigint,
  tenant_created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  return query
  select
    t.id,
    t.display_name,
    p.full_name,
    u.email::text,
    sp.name,
    sp.price_cents,
    ts.status,
    ts.trial_ends_at,
    coalesce(c.client_count, 0),
    t.created_at
  from public.tenants t
  left join public.profiles p on p.tenant_id = t.id and p.role = 'admin'
  left join auth.users u on u.id = p.id
  left join public.tenant_subscriptions ts on ts.tenant_id = t.id
  left join public.saas_plans sp on sp.id = ts.plan_id
  left join (
    select tenant_id, count(*) as client_count
    from public.clients
    group by tenant_id
  ) c on c.tenant_id = t.id
  order by t.created_at desc;
end;
$$;

revoke all on function public.owner_dashboard_overview() from public;
grant execute on function public.owner_dashboard_overview() to authenticated;

commit;
