-- Bakery Book: initial inventory, production, and sales schema.
-- Run this migration in a new Supabase project before connecting the app.

create extension if not exists pgcrypto;

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  base_unit text not null check (base_unit in ('g', 'kg', 'ml', 'l', 'pcs')),
  low_stock_threshold numeric(14, 3) not null default 0 check (low_stock_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ingredients_owner_name_key on public.ingredients (owner_id, lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sku text,
  selling_price_mmk bigint not null default 0 check (selling_price_mmk >= 0),
  low_stock_threshold numeric(14, 3) not null default 0 check (low_stock_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_owner_name_key on public.products (owner_id, lower(name));

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null,
  version integer not null default 1 check (version > 0),
  expected_yield numeric(14, 3) not null check (expected_yield > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, product_id, version)
);
create unique index one_active_recipe_per_product on public.recipes (owner_id, product_id) where active;

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (recipe_id, ingredient_id)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_date date not null default current_date,
  total_amount_mmk bigint not null default 0 check (total_amount_mmk >= 0),
  note text,
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_cost_mmk numeric(14, 4) not null check (unit_cost_mmk >= 0),
  created_at timestamptz not null default now()
);

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  recipe_id uuid references public.recipes(id) on delete set null,
  batch_count numeric(10, 2) not null default 1 check (batch_count > 0),
  good_quantity numeric(14, 3) not null check (good_quantity > 0),
  waste_quantity numeric(14, 3) not null default 0 check (waste_quantity >= 0),
  ingredient_cost_mmk bigint not null default 0 check (ingredient_cost_mmk >= 0),
  note text,
  baked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.batch_inputs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  planned_quantity numeric(14, 3) not null default 0 check (planned_quantity >= 0),
  actual_quantity numeric(14, 3) not null check (actual_quantity > 0),
  unit_cost_mmk numeric(14, 4) not null default 0 check (unit_cost_mmk >= 0),
  created_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  total_amount_mmk bigint not null default 0 check (total_amount_mmk >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'mobile', 'credit', 'mixed')),
  note text,
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price_mmk bigint not null check (unit_price_mmk >= 0),
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('raw', 'finished')),
  ingredient_id uuid references public.ingredients(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  quantity_delta numeric(14, 3) not null check (quantity_delta <> 0),
  unit_cost_mmk numeric(14, 4) not null default 0 check (unit_cost_mmk >= 0),
  movement_type text not null check (movement_type in ('purchase', 'production_use', 'production_output', 'sale', 'waste', 'adjustment', 'reversal')),
  reference_type text,
  reference_id uuid,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (item_type = 'raw' and ingredient_id is not null and product_id is null)
    or (item_type = 'finished' and ingredient_id is null and product_id is not null)
  )
);

create index stock_movements_raw_lookup on public.stock_movements (owner_id, ingredient_id, occurred_at);
create index stock_movements_finished_lookup on public.stock_movements (owner_id, product_id, occurred_at);
create index sales_owner_sold_at on public.sales (owner_id, sold_at desc);
create index batches_owner_baked_at on public.production_batches (owner_id, baked_at desc);
create index purchases_owner_date on public.purchases (owner_id, purchase_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ingredients_set_updated_at before update on public.ingredients for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger recipes_set_updated_at before update on public.recipes for each row execute function public.set_updated_at();

alter table public.ingredients enable row level security;
alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.production_batches enable row level security;
alter table public.batch_inputs enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;

create policy "ingredients_owner_access" on public.ingredients for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "products_owner_access" on public.products for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "suppliers_owner_access" on public.suppliers for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "recipes_owner_access" on public.recipes for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "recipe_items_owner_access" on public.recipe_items for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "purchases_owner_read" on public.purchases for select to authenticated using (owner_id = auth.uid());
create policy "purchase_items_owner_read" on public.purchase_items for select to authenticated using (owner_id = auth.uid());
create policy "batches_owner_read" on public.production_batches for select to authenticated using (owner_id = auth.uid());
create policy "batch_inputs_owner_read" on public.batch_inputs for select to authenticated using (owner_id = auth.uid());
create policy "sales_owner_read" on public.sales for select to authenticated using (owner_id = auth.uid());
create policy "sale_items_owner_read" on public.sale_items for select to authenticated using (owner_id = auth.uid());
create policy "stock_movements_owner_read" on public.stock_movements for select to authenticated using (owner_id = auth.uid());

grant select, insert, update, delete on public.ingredients, public.products, public.suppliers, public.recipes, public.recipe_items to authenticated;
grant select on public.purchases, public.purchase_items, public.production_batches, public.batch_inputs, public.sales, public.sale_items, public.stock_movements to authenticated;

create or replace view public.raw_stock_levels
with (security_invoker = true)
as
select
  i.owner_id,
  i.id as ingredient_id,
  i.name,
  i.base_unit,
  i.low_stock_threshold,
  coalesce(sum(m.quantity_delta), 0)::numeric(14, 3) as quantity,
  (coalesce(sum(m.quantity_delta), 0) <= i.low_stock_threshold) as is_low
from public.ingredients i
left join public.stock_movements m
  on m.ingredient_id = i.id and m.owner_id = i.owner_id
where i.owner_id = auth.uid() and i.active
group by i.owner_id, i.id, i.name, i.base_unit, i.low_stock_threshold;

create or replace view public.finished_stock_levels
with (security_invoker = true)
as
select
  p.owner_id,
  p.id as product_id,
  p.name,
  p.selling_price_mmk,
  p.low_stock_threshold,
  coalesce(sum(m.quantity_delta), 0)::numeric(14, 3) as quantity,
  (coalesce(sum(m.quantity_delta), 0) <= p.low_stock_threshold) as is_low
from public.products p
left join public.stock_movements m
  on m.product_id = p.id and m.owner_id = p.owner_id
where p.owner_id = auth.uid() and p.active
group by p.owner_id, p.id, p.name, p.selling_price_mmk, p.low_stock_threshold;

grant select on public.raw_stock_levels to authenticated;
grant select on public.finished_stock_levels to authenticated;

create or replace function public.record_purchase(
  p_supplier_id uuid,
  p_purchase_date date,
  p_items jsonb,
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
  v_item jsonb;
  v_ingredient_id uuid;
  v_quantity numeric(14, 3);
  v_unit_cost numeric(14, 4);
  v_total bigint := 0;
begin
  if v_owner is null then raise exception 'Authentication is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'At least one purchase item is required'; end if;
  if p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id and owner_id = v_owner) then raise exception 'Supplier not found'; end if;

  insert into public.purchases (owner_id, supplier_id, purchase_date, note)
  values (v_owner, p_supplier_id, coalesce(p_purchase_date, current_date), nullif(trim(p_note), ''))
  returning id into v_purchase_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_ingredient_id := (v_item->>'ingredient_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost_mmk')::numeric;
    if v_quantity <= 0 or v_unit_cost < 0 then raise exception 'Invalid purchase quantity or cost'; end if;
    if not exists (select 1 from public.ingredients where id = v_ingredient_id and owner_id = v_owner and active) then raise exception 'Ingredient not found'; end if;

    insert into public.purchase_items (owner_id, purchase_id, ingredient_id, quantity, unit_cost_mmk)
    values (v_owner, v_purchase_id, v_ingredient_id, v_quantity, v_unit_cost);
    insert into public.stock_movements (owner_id, item_type, ingredient_id, quantity_delta, unit_cost_mmk, movement_type, reference_type, reference_id)
    values (v_owner, 'raw', v_ingredient_id, v_quantity, v_unit_cost, 'purchase', 'purchase', v_purchase_id);
    v_total := v_total + round(v_quantity * v_unit_cost)::bigint;
  end loop;

  update public.purchases set total_amount_mmk = v_total where id = v_purchase_id;
  return v_purchase_id;
end;
$$;

create or replace function public.record_baking_batch(
  p_product_id uuid,
  p_recipe_id uuid,
  p_batch_count numeric,
  p_inputs jsonb,
  p_good_quantity numeric,
  p_waste_quantity numeric default 0,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_batch_id uuid;
  v_item jsonb;
  v_ingredient_id uuid;
  v_planned numeric(14, 3);
  v_actual numeric(14, 3);
  v_available numeric(14, 3);
  v_unit_cost numeric(14, 4);
  v_total_cost bigint := 0;
begin
  if v_owner is null then raise exception 'Authentication is required'; end if;
  if p_batch_count <= 0 or p_good_quantity <= 0 or coalesce(p_waste_quantity, 0) < 0 then raise exception 'Invalid batch quantities'; end if;
  if jsonb_typeof(p_inputs) <> 'array' or jsonb_array_length(p_inputs) = 0 then raise exception 'At least one ingredient input is required'; end if;
  if not exists (select 1 from public.products where id = p_product_id and owner_id = v_owner and active) then raise exception 'Product not found'; end if;
  if p_recipe_id is not null and not exists (select 1 from public.recipes where id = p_recipe_id and owner_id = v_owner and product_id = p_product_id) then raise exception 'Recipe not found'; end if;

  insert into public.production_batches (owner_id, product_id, recipe_id, batch_count, good_quantity, waste_quantity, note)
  values (v_owner, p_product_id, p_recipe_id, p_batch_count, p_good_quantity, coalesce(p_waste_quantity, 0), nullif(trim(p_note), ''))
  returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_inputs)
  loop
    v_ingredient_id := (v_item->>'ingredient_id')::uuid;
    v_planned := coalesce((v_item->>'planned_quantity')::numeric, 0);
    v_actual := (v_item->>'actual_quantity')::numeric;
    if v_actual <= 0 or v_planned < 0 then raise exception 'Invalid ingredient quantity'; end if;
    if not exists (select 1 from public.ingredients where id = v_ingredient_id and owner_id = v_owner and active) then raise exception 'Ingredient not found'; end if;

    select coalesce(sum(quantity_delta), 0) into v_available
    from public.stock_movements where owner_id = v_owner and ingredient_id = v_ingredient_id;
    if v_available < v_actual then raise exception 'Insufficient raw-material stock'; end if;

    select coalesce(
      sum(quantity_delta * unit_cost_mmk) filter (where quantity_delta > 0)
      / nullif(sum(quantity_delta) filter (where quantity_delta > 0), 0), 0
    ) into v_unit_cost
    from public.stock_movements where owner_id = v_owner and ingredient_id = v_ingredient_id;

    insert into public.batch_inputs (owner_id, batch_id, ingredient_id, planned_quantity, actual_quantity, unit_cost_mmk)
    values (v_owner, v_batch_id, v_ingredient_id, v_planned, v_actual, v_unit_cost);
    insert into public.stock_movements (owner_id, item_type, ingredient_id, quantity_delta, unit_cost_mmk, movement_type, reference_type, reference_id)
    values (v_owner, 'raw', v_ingredient_id, -v_actual, v_unit_cost, 'production_use', 'production_batch', v_batch_id);
    v_total_cost := v_total_cost + round(v_actual * v_unit_cost)::bigint;
  end loop;

  update public.production_batches set ingredient_cost_mmk = v_total_cost where id = v_batch_id;
  insert into public.stock_movements (owner_id, item_type, product_id, quantity_delta, unit_cost_mmk, movement_type, reference_type, reference_id)
  values (v_owner, 'finished', p_product_id, p_good_quantity, v_total_cost / p_good_quantity, 'production_output', 'production_batch', v_batch_id);
  return v_batch_id;
end;
$$;

create or replace function public.record_sale(
  p_items jsonb,
  p_payment_method text default 'cash',
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14, 3);
  v_unit_price bigint;
  v_unit_cost numeric(14, 4);
  v_available numeric(14, 3);
  v_total bigint := 0;
begin
  if v_owner is null then raise exception 'Authentication is required'; end if;
  if p_payment_method not in ('cash', 'mobile', 'credit', 'mixed') then raise exception 'Invalid payment method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'At least one sale item is required'; end if;

  insert into public.sales (owner_id, payment_method, note)
  values (v_owner, p_payment_method, nullif(trim(p_note), ''))
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price_mmk')::bigint;
    if v_quantity <= 0 or v_unit_price < 0 then raise exception 'Invalid sale quantity or price'; end if;
    if not exists (select 1 from public.products where id = v_product_id and owner_id = v_owner and active) then raise exception 'Product not found'; end if;

    select coalesce(sum(quantity_delta), 0) into v_available
    from public.stock_movements where owner_id = v_owner and product_id = v_product_id;
    if v_available < v_quantity then raise exception 'Insufficient finished-goods stock'; end if;

    select coalesce(
      sum(quantity_delta * unit_cost_mmk) filter (where quantity_delta > 0)
      / nullif(sum(quantity_delta) filter (where quantity_delta > 0), 0), 0
    ) into v_unit_cost
    from public.stock_movements where owner_id = v_owner and product_id = v_product_id;

    insert into public.sale_items (owner_id, sale_id, product_id, quantity, unit_price_mmk)
    values (v_owner, v_sale_id, v_product_id, v_quantity, v_unit_price);
    insert into public.stock_movements (owner_id, item_type, product_id, quantity_delta, unit_cost_mmk, movement_type, reference_type, reference_id)
    values (v_owner, 'finished', v_product_id, -v_quantity, v_unit_cost, 'sale', 'sale', v_sale_id);
    v_total := v_total + round(v_quantity * v_unit_price)::bigint;
  end loop;

  update public.sales set total_amount_mmk = v_total where id = v_sale_id;
  return v_sale_id;
end;
$$;

revoke all on function public.record_purchase(uuid, date, jsonb, text) from public;
revoke all on function public.record_baking_batch(uuid, uuid, numeric, jsonb, numeric, numeric, text) from public;
revoke all on function public.record_sale(jsonb, text, text) from public;
grant execute on function public.record_purchase(uuid, date, jsonb, text) to authenticated;
grant execute on function public.record_baking_batch(uuid, uuid, numeric, jsonb, numeric, numeric, text) to authenticated;
grant execute on function public.record_sale(jsonb, text, text) to authenticated;
