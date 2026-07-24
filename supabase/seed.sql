begin;

insert into public.tenants (id, legal_name, display_name, status)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Control Premium Demonstração A Ltda.',
    'Control Demo A',
    'active'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Control Premium Demonstração B Ltda.',
    'Control Demo B',
    'active'
  )
on conflict (id) do nothing;

insert into public.clients (id, tenant_id, full_name, phone, email, status)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Cliente Fictício A',
    '+5500000000001',
    'cliente-a@example.invalid',
    'under_review'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Cliente Fictício B',
    '+5500000000002',
    'cliente-b@example.invalid',
    'under_review'
  )
on conflict (id) do nothing;

commit;
