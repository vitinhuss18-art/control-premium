begin;

alter table public.tenants
  add column if not exists pass_through_operational_costs boolean not null default false,
  add column if not exists operational_cost_mode text
    check (operational_cost_mode in ('percentage', 'fixed')),
  add column if not exists operational_cost_percentage_bps integer
    check (
      operational_cost_percentage_bps is null
      or (operational_cost_percentage_bps >= 0 and operational_cost_percentage_bps <= 10000)
    ),
  add column if not exists operational_cost_fixed_cents bigint
    check (operational_cost_fixed_cents is null or operational_cost_fixed_cents >= 0);

alter table public.tenants
  drop constraint if exists tenants_operational_cost_config_check;
alter table public.tenants
  add constraint tenants_operational_cost_config_check
  check (
    pass_through_operational_costs = false
    or (
      operational_cost_mode = 'percentage'
      and operational_cost_percentage_bps is not null
    )
    or (
      operational_cost_mode = 'fixed'
      and operational_cost_fixed_cents is not null
    )
  );

commit;
