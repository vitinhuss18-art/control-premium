begin;

-- Validates a client signup link token and returns the tenant_id.
-- Safe to call with the anon key — only returns tenant_id, nothing else.
create or replace function public.validate_signup_link_token(p_token text)
returns uuid
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
    and active = true
  for update;

  if v_link.id is null then
    raise exception 'Link inválido ou expirado';
  end if;

  return v_link.tenant_id;
end;
$$;

revoke all on function public.validate_signup_link_token(text) from public;
grant execute on function public.validate_signup_link_token(text) to anon, authenticated;

commit;
