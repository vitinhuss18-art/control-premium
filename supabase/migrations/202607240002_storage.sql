begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy documents_select_same_tenant
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and (
    (storage.foldername(name))[1] = public.current_tenant_id()::text
    or public.is_super_admin()
  )
);

create policy documents_insert_same_tenant
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (
    (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      and public.has_staff_role()
    )
    or public.is_super_admin()
  )
);

create policy documents_update_same_tenant
on storage.objects for update
to authenticated
using (
  bucket_id = 'documents'
  and (
    (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      and public.has_staff_role()
    )
    or public.is_super_admin()
  )
)
with check (
  bucket_id = 'documents'
  and (
    (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      and public.has_staff_role()
    )
    or public.is_super_admin()
  )
);

create policy documents_delete_same_tenant
on storage.objects for delete
to authenticated
using (
  bucket_id = 'documents'
  and (
    (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      and public.has_staff_role()
    )
    or public.is_super_admin()
  )
);

commit;
