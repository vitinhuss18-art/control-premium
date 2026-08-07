begin;

-- O Supabase concede EXECUTE a anon/authenticated/service_role por padrao
-- quando funcoes sao criadas pela API de administracao. O REVOKE de PUBLIC
-- das migrations anteriores nao removeu o grant explicito de anon. Estas
-- RPCs pertencem exclusivamente ao painel autenticado do super_admin.
revoke all on function public.owner_dashboard_overview() from public, anon;
grant execute on function public.owner_dashboard_overview() to authenticated;

create or replace function public.owner_set_tenant_status(
  p_tenant_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_status text;
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  if p_status not in ('active', 'suspended') then
    raise exception 'Status invalido para essa acao';
  end if;

  if p_status = 'suspended' and v_note is null then
    raise exception 'Informe o motivo da suspensao';
  end if;

  if char_length(v_note) > 500 then
    raise exception 'O motivo deve ter no maximo 500 caracteres';
  end if;

  select status into v_previous_status
  from public.tenants
  where id = p_tenant_id
  for update;

  if v_previous_status is null then
    raise exception 'Assinante nao encontrado';
  end if;

  if v_previous_status = p_status then
    return;
  end if;

  update public.tenants
  set status = p_status,
      updated_at = now()
  where id = p_tenant_id;

  insert into public.audit_logs (
    tenant_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    p_tenant_id,
    auth.uid(),
    'owner.tenant_status_changed',
    'tenant',
    p_tenant_id::text,
    jsonb_build_object(
      'previous_status', v_previous_status,
      'new_status', p_status,
      'note', v_note
    )
  );
end;
$$;

revoke all on function public.owner_set_tenant_status(uuid, text, text)
  from public, anon;
grant execute on function public.owner_set_tenant_status(uuid, text, text)
  to authenticated;

commit;
