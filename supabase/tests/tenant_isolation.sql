begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin-a@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin-b@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.tenants (id, legal_name, display_name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Empresa A Teste', 'Empresa A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Empresa B Teste', 'Empresa B');

insert into public.profiles (id, tenant_id, full_name, role)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Administrador A',
    'admin'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Administrador B',
    'admin'
  );

insert into public.clients (id, tenant_id, full_name, status)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Cliente A',
    'approved'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Cliente B',
    'approved'
  );

insert into public.audit_logs (tenant_id, action, entity_type, details)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'isolation.test',
  'test',
  '{}'::jsonb
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select display_name from public.tenants order by display_name$$,
  array['Empresa A'::text],
  'Empresa A enxerga somente a própria empresa'
);

select results_eq(
  $$select full_name from public.clients order by full_name$$,
  array['Cliente A'::text],
  'Empresa A enxerga somente os próprios clientes'
);

select is(
  public.current_tenant_id(),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'tenant atual é derivado do usuário autenticado'
);

select throws_ok(
  $$
    insert into public.clients (tenant_id, full_name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invasão bloqueada')
  $$,
  '42501',
  null,
  'Empresa A não insere cliente na Empresa B'
);

create temporary table pgtap_update_check as
with changed as (
  update public.clients
  set full_name = 'Alteração bloqueada'
  where id = 'b2000000-0000-4000-8000-000000000002'
  returning 1
)
select count(*)::integer as changed_count from changed;

select is(
  (select changed_count from pgtap_update_check),
  0,
  'Empresa A não altera cliente da Empresa B'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  0,
  'Empresa A não lê auditoria da Empresa B'
);

select * from finish();

rollback;
