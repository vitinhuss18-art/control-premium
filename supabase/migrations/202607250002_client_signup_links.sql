begin;

create table public.client_signup_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token_hash char(64) not null unique,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index client_signup_links_tenant_idx
  on public.client_signup_links (tenant_id, active);

-- Cria (ou reaproveita) um link de auto-cadastro ativo para a empresa do administrador logado.
-- Retorna o token em texto puro (não fica salvo em lugar nenhum, só o hash é armazenado).
create or replace function public.create_client_signup_link()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant_id uuid;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária';
  end if;

  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null or not public.can_manage_tenant() then
    raise exception 'Apenas administradores podem gerar o link de cadastro';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.client_signup_links (tenant_id, token_hash, created_by)
  values (v_tenant_id, encode(digest(v_token, 'sha256'), 'hex'), auth.uid());

  return v_token;
end;
$$;

-- Usado pela página pública de cadastro. O cliente já deve estar autenticado
-- (conta criada via supabase.auth.signUp) antes de chamar esta função.
create or replace function public.register_client_via_link(
  p_link_token text,
  p_full_name text,
  p_cpf text,
  p_phone text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.client_signup_links%rowtype;
  v_client_id uuid;
  v_cpf_digits text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Este usuário já está vinculado a uma empresa';
  end if;

  select *
  into v_link
  from public.client_signup_links
  where token_hash = encode(digest(p_link_token, 'sha256'), 'hex')
    and active = true
  for update;

  if v_link.id is null then
    raise exception 'Link de cadastro inválido ou expirado';
  end if;

  if nullif(trim(p_full_name), '') is null then
    raise exception 'Nome é obrigatório';
  end if;

  v_cpf_digits := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');

  insert into public.clients (
    tenant_id, full_name, cpf, phone, email, user_id, status, created_by
  )
  values (
    v_link.tenant_id, trim(p_full_name), v_cpf_digits, p_phone, p_email,
    auth.uid(), 'incomplete', v_link.created_by
  )
  returning id into v_client_id;

  insert into public.profiles (id, tenant_id, full_name, role, active)
  values (auth.uid(), v_link.tenant_id, trim(p_full_name), 'client', true);

  insert into public.audit_logs (
    tenant_id, actor_id, action, entity_type, entity_id, details
  )
  values (
    v_link.tenant_id, auth.uid(), 'client.self_registered', 'client',
    v_client_id::text, '{}'::jsonb
  );

  return v_client_id;
end;
$$;

alter table public.client_signup_links enable row level security;

create policy client_signup_links_select_managers
on public.client_signup_links for select
using (
  tenant_id = public.current_tenant_id() and public.can_manage_tenant()
);

create policy client_signup_links_update_managers
on public.client_signup_links for update
using (
  tenant_id = public.current_tenant_id() and public.can_manage_tenant()
)
with check (
  tenant_id = public.current_tenant_id() and public.can_manage_tenant()
);

revoke all on function public.create_client_signup_link() from public;
revoke all on function public.register_client_via_link(text, text, text, text, text) from public;
grant execute on function public.create_client_signup_link() to authenticated;
grant execute on function public.register_client_via_link(text, text, text, text, text) to authenticated;

commit;
