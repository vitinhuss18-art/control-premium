begin;

create table public.client_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  signup_link_id uuid references public.client_signup_links(id) on delete set null,
  full_name text not null,
  cpf text not null,
  instagram text,
  pix_key text,
  whatsapp text not null,
  sms text,
  address text not null,
  region text not null,
  loan_amount_cents integer not null check (loan_amount_cents > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_proposals_tenant_status_idx
  on public.client_proposals (tenant_id, status);

create index client_proposals_tenant_created_idx
  on public.client_proposals (tenant_id, created_at desc);

create trigger client_proposals_set_updated_at
before update on public.client_proposals
for each row execute function public.set_updated_at();

alter table public.client_proposals enable row level security;

create policy client_proposals_select_managers
on public.client_proposals for select
to authenticated
using (
  tenant_id = public.current_tenant_id() and public.has_staff_role()
);

create policy client_proposals_insert_anon
on public.client_proposals for insert
to anon, authenticated
with check (status = 'pending');

create policy client_proposals_update_managers
on public.client_proposals for update
to authenticated
using (
  tenant_id = public.current_tenant_id() and public.has_staff_role()
)
with check (
  tenant_id = public.current_tenant_id() and public.has_staff_role()
);

revoke delete on public.client_proposals from authenticated, anon;

insert into storage.buckets (id, name, public, file_size_limit)
values ('client-documents', 'client-documents', false, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy client_documents_select_managers
on storage.objects for select
to authenticated
using (
  bucket_id = 'client-documents'
  and (
    (storage.foldername(name))[1] = public.current_tenant_id()::text
    or public.is_super_admin()
  )
);

create policy client_documents_insert_service
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'client-documents'
);

commit;
