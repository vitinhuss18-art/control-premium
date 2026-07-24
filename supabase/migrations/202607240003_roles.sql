begin;

alter type public.app_role
  add value if not exists 'manager' after 'admin';

commit;
