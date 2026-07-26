begin;

alter table public.credit_proposals
  add column if not exists operation_type text not null default 'loan'
    check (operation_type in ('loan', 'installment_sale')),
  add column if not exists product_name text,
  add column if not exists product_description text,
  add column if not exists product_photo_path text,
  add column if not exists sale_price_cents bigint
    check (sale_price_cents is null or sale_price_cents > 0),
  add column if not exists down_payment_cents bigint
    check (down_payment_cents is null or down_payment_cents >= 0);

alter table public.credit_proposals
  drop constraint if exists credit_proposals_operation_fields_check;
alter table public.credit_proposals
  add constraint credit_proposals_operation_fields_check
  check (
    operation_type = 'loan'
    or (
      operation_type = 'installment_sale'
      and product_name is not null
      and sale_price_cents is not null
      and (down_payment_cents is null or down_payment_cents < sale_price_cents)
    )
  );

alter table public.loans
  add column if not exists operation_type text not null default 'loan'
    check (operation_type in ('loan', 'installment_sale'));

commit;
