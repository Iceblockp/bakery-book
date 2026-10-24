-- Bakery Book: simple supplier names, operating expenses, and cash accounting.

alter table public.purchases
  add column if not exists supplier_name text;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  expense_date date not null default current_date,
  category text not null check (category in ('packaging', 'utilities', 'transport', 'rent', 'wages', 'equipment', 'repairs', 'other')),
  amount_mmk bigint not null check (amount_mmk > 0),
  description text,
  created_at timestamptz not null default now()
);

create index if not exists expenses_owner_date on public.expenses (owner_id, expense_date desc);

alter table public.expenses enable row level security;
drop policy if exists "expenses_owner_access" on public.expenses;
create policy "expenses_owner_access" on public.expenses
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.expenses to authenticated;

create or replace function public.record_simple_purchase(
  p_ingredient_id uuid,
  p_quantity numeric,
  p_total_amount_mmk bigint,
  p_purchase_date date default null,
  p_supplier_name text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_purchase_id uuid;
  v_unit_cost numeric(14, 4);
begin
  if v_owner is null then raise exception 'Authentication is required'; end if;
  if p_quantity <= 0 or p_total_amount_mmk <= 0 then raise exception 'Quantity and total paid must be greater than zero'; end if;
  if not exists (select 1 from public.ingredients where id = p_ingredient_id and owner_id = v_owner and active) then raise exception 'Ingredient not found'; end if;

  v_unit_cost := p_total_amount_mmk::numeric / p_quantity;

  insert into public.purchases (owner_id, purchase_date, total_amount_mmk, supplier_name, note)
  values (
    v_owner,
    coalesce(p_purchase_date, current_date),
    p_total_amount_mmk,
    nullif(trim(p_supplier_name), ''),
    nullif(trim(p_note), '')
  )
  returning id into v_purchase_id;

  insert into public.purchase_items (owner_id, purchase_id, ingredient_id, quantity, unit_cost_mmk)
  values (v_owner, v_purchase_id, p_ingredient_id, p_quantity, v_unit_cost);

  insert into public.stock_movements (
    owner_id, item_type, ingredient_id, quantity_delta, unit_cost_mmk,
    movement_type, reference_type, reference_id
  ) values (
    v_owner, 'raw', p_ingredient_id, p_quantity, v_unit_cost,
    'purchase', 'purchase', v_purchase_id
  );

  return v_purchase_id;
end;
$$;

revoke all on function public.record_simple_purchase(uuid, numeric, bigint, date, text, text) from public;
grant execute on function public.record_simple_purchase(uuid, numeric, bigint, date, text, text) to authenticated;
