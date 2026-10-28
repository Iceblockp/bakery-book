-- Bakery Book: recipe blueprints, opening/adjusted stock, history reversals,
-- catalog maintenance, and correct moving-average inventory costing.

alter table public.sales add column if not exists reversed_at timestamptz, add column if not exists reversal_note text;
alter table public.purchases add column if not exists reversed_at timestamptz, add column if not exists reversal_note text;
alter table public.production_batches add column if not exists reversed_at timestamptz, add column if not exists reversal_note text;
alter table public.expenses add column if not exists reversed_at timestamptz, add column if not exists reversal_note text;

create or replace function public.save_recipe_blueprint(
  p_product_id uuid,
  p_name text,
  p_expected_yield numeric,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_recipe_id uuid;
  v_version integer;
  v_item jsonb;
  v_ingredient_id uuid;
  v_quantity numeric;
begin
  if v_owner is null then raise exception 'Authentication is required'; end if;
  if p_expected_yield <= 0 then raise exception 'Expected yield must be greater than zero'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'At least one recipe ingredient is required'; end if;
  if not exists (select 1 from public.products where id = p_product_id and owner_id = v_owner and active) then raise exception 'Product not found'; end if;

  select coalesce(max(version), 0) + 1 into v_version from public.recipes where owner_id = v_owner and product_id = p_product_id;
  update public.recipes set active = false where owner_id = v_owner and product_id = p_product_id and active;
  insert into public.recipes (owner_id, product_id, name, version, expected_yield)
  values (v_owner, p_product_id, nullif(trim(p_name), ''), v_version, p_expected_yield)
  returning id into v_recipe_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_ingredient_id := (v_item->>'ingredient_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity <= 0 then raise exception 'Recipe quantities must be greater than zero'; end if;
    if not exists (select 1 from public.ingredients where id = v_ingredient_id and owner_id = v_owner and active) then raise exception 'Ingredient not found'; end if;
    insert into public.recipe_items (owner_id, recipe_id, ingredient_id, quantity)
    values (v_owner, v_recipe_id, v_ingredient_id, v_quantity);
  end loop;
  return v_recipe_id;
end;
$$;

create or replace function public.set_stock_count(
  p_item_type text,
  p_item_id uuid,
  p_target_quantity numeric,
  p_unit_cost_mmk numeric default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_current numeric := 0;
  v_delta numeric;
  v_cost numeric := 0;
  v_id uuid;
begin
  if v_owner is null then raise exception 'Authentication is required'; end if;
  if p_item_type not in ('raw', 'finished') or p_target_quantity < 0 then raise exception 'Invalid stock count'; end if;
  if p_item_type = 'raw' then
    if not exists (select 1 from public.ingredients where id = p_item_id and owner_id = v_owner and active) then raise exception 'Ingredient not found'; end if;
    select coalesce(sum(quantity_delta), 0), coalesce(sum(quantity_delta * unit_cost_mmk) / nullif(sum(quantity_delta), 0), 0)
      into v_current, v_cost from public.stock_movements where owner_id = v_owner and ingredient_id = p_item_id;
  else
    if not exists (select 1 from public.products where id = p_item_id and owner_id = v_owner and active) then raise exception 'Product not found'; end if;
    select coalesce(sum(quantity_delta), 0), coalesce(sum(quantity_delta * unit_cost_mmk) / nullif(sum(quantity_delta), 0), 0)
      into v_current, v_cost from public.stock_movements where owner_id = v_owner and product_id = p_item_id;
  end if;
  v_delta := p_target_quantity - v_current;
  if v_delta = 0 then raise exception 'The counted quantity already matches stock'; end if;
  if v_delta > 0 and p_unit_cost_mmk is not null then v_cost := p_unit_cost_mmk; end if;
  if v_cost < 0 then raise exception 'Unit cost cannot be negative'; end if;

  insert into public.stock_movements (owner_id, item_type, ingredient_id, product_id, quantity_delta, unit_cost_mmk, movement_type, reference_type, note)
  values (v_owner, p_item_type, case when p_item_type = 'raw' then p_item_id end, case when p_item_type = 'finished' then p_item_id end, v_delta, v_cost, 'adjustment', 'stock_count', nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.reverse_bakery_transaction(p_type text, p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_move record;
  v_available numeric;
begin
  if v_owner is null then raise exception 'Authentication is required'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'A reversal reason is required'; end if;

  if p_type = 'sale' then
    if not exists (select 1 from public.sales where id = p_id and owner_id = v_owner and reversed_at is null) then raise exception 'Sale not found or already reversed'; end if;
    for v_move in select * from public.stock_movements where owner_id = v_owner and reference_id = p_id and movement_type = 'sale' loop
      insert into public.stock_movements (owner_id,item_type,ingredient_id,product_id,quantity_delta,unit_cost_mmk,movement_type,reference_type,reference_id,note)
      values (v_owner,v_move.item_type,v_move.ingredient_id,v_move.product_id,-v_move.quantity_delta,v_move.unit_cost_mmk,'reversal','sale',p_id,p_note);
    end loop;
    update public.sales set reversed_at = now(), reversal_note = trim(p_note) where id = p_id and owner_id = v_owner;
  elsif p_type = 'purchase' then
    if not exists (select 1 from public.purchases where id = p_id and owner_id = v_owner and reversed_at is null) then raise exception 'Purchase not found or already reversed'; end if;
    for v_move in select * from public.stock_movements where owner_id = v_owner and reference_id = p_id and movement_type = 'purchase' loop
      select coalesce(sum(quantity_delta),0) into v_available from public.stock_movements where owner_id=v_owner and ingredient_id=v_move.ingredient_id;
      if v_available < v_move.quantity_delta then raise exception 'Not enough raw stock to reverse this purchase'; end if;
      insert into public.stock_movements (owner_id,item_type,ingredient_id,product_id,quantity_delta,unit_cost_mmk,movement_type,reference_type,reference_id,note)
      values (v_owner,v_move.item_type,v_move.ingredient_id,v_move.product_id,-v_move.quantity_delta,v_move.unit_cost_mmk,'reversal','purchase',p_id,p_note);
    end loop;
    update public.purchases set reversed_at = now(), reversal_note = trim(p_note) where id = p_id and owner_id = v_owner;
  elsif p_type = 'batch' then
    if not exists (select 1 from public.production_batches where id = p_id and owner_id = v_owner and reversed_at is null) then raise exception 'Batch not found or already reversed'; end if;
    for v_move in select * from public.stock_movements where owner_id = v_owner and reference_id = p_id and movement_type in ('production_use','production_output') loop
      if v_move.product_id is not null and v_move.quantity_delta > 0 then
        select coalesce(sum(quantity_delta),0) into v_available from public.stock_movements where owner_id=v_owner and product_id=v_move.product_id;
        if v_available < v_move.quantity_delta then raise exception 'Not enough finished stock to reverse this batch'; end if;
      end if;
      insert into public.stock_movements (owner_id,item_type,ingredient_id,product_id,quantity_delta,unit_cost_mmk,movement_type,reference_type,reference_id,note)
      values (v_owner,v_move.item_type,v_move.ingredient_id,v_move.product_id,-v_move.quantity_delta,v_move.unit_cost_mmk,'reversal','production_batch',p_id,p_note);
    end loop;
    update public.production_batches set reversed_at = now(), reversal_note = trim(p_note) where id = p_id and owner_id = v_owner;
  elsif p_type = 'expense' then
    update public.expenses set reversed_at = now(), reversal_note = trim(p_note) where id = p_id and owner_id = v_owner and reversed_at is null;
    if not found then raise exception 'Expense not found or already reversed'; end if;
  else
    raise exception 'Invalid transaction type';
  end if;
end;
$$;

revoke all on function public.save_recipe_blueprint(uuid,text,numeric,jsonb) from public;
revoke all on function public.set_stock_count(text,uuid,numeric,numeric,text) from public;
revoke all on function public.reverse_bakery_transaction(text,uuid,text) from public;
grant execute on function public.save_recipe_blueprint(uuid,text,numeric,jsonb) to authenticated;
grant execute on function public.set_stock_count(text,uuid,numeric,numeric,text) to authenticated;
grant execute on function public.reverse_bakery_transaction(text,uuid,text) to authenticated;

-- Correct outgoing movement costs to the current moving-average balance.
create or replace function public.apply_current_moving_average_cost()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quantity numeric;
  v_value numeric;
  v_output_cost numeric;
begin
  if new.movement_type = 'production_output' then
    select coalesce(sum(bi.actual_quantity * bi.unit_cost_mmk) / nullif(pb.good_quantity,0), 0)
      into v_output_cost
      from public.production_batches pb
      left join public.batch_inputs bi on bi.batch_id = pb.id
      where pb.id = new.reference_id
      group by pb.good_quantity;
    new.unit_cost_mmk := coalesce(v_output_cost, 0);
    return new;
  end if;
  if new.movement_type not in ('production_use', 'sale') then return new; end if;
  if new.item_type = 'raw' then
    select coalesce(sum(quantity_delta),0), coalesce(sum(quantity_delta * unit_cost_mmk),0)
      into v_quantity, v_value from public.stock_movements
      where owner_id = new.owner_id and ingredient_id = new.ingredient_id;
  else
    select coalesce(sum(quantity_delta),0), coalesce(sum(quantity_delta * unit_cost_mmk),0)
      into v_quantity, v_value from public.stock_movements
      where owner_id = new.owner_id and product_id = new.product_id;
  end if;
  new.unit_cost_mmk := coalesce(v_value / nullif(v_quantity,0), 0);
  return new;
end;
$$;

drop trigger if exists stock_movements_current_cost on public.stock_movements;
create trigger stock_movements_current_cost
before insert on public.stock_movements
for each row execute function public.apply_current_moving_average_cost();

create or replace function public.apply_batch_input_cost()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quantity numeric;
  v_value numeric;
begin
  select coalesce(sum(quantity_delta),0), coalesce(sum(quantity_delta * unit_cost_mmk),0)
    into v_quantity, v_value from public.stock_movements
    where owner_id = new.owner_id and ingredient_id = new.ingredient_id;
  new.unit_cost_mmk := coalesce(v_value / nullif(v_quantity,0), 0);
  return new;
end;
$$;

drop trigger if exists batch_inputs_current_cost on public.batch_inputs;
create trigger batch_inputs_current_cost
before insert on public.batch_inputs
for each row execute function public.apply_batch_input_cost();

create or replace function public.correct_batch_total_cost()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total_cost bigint;
begin
  select coalesce(round(sum(actual_quantity * unit_cost_mmk)),0)::bigint
    into v_total_cost from public.batch_inputs where batch_id = new.id;
  new.ingredient_cost_mmk := v_total_cost;
  return new;
end;
$$;

drop trigger if exists production_batches_correct_cost on public.production_batches;
create trigger production_batches_correct_cost
before update of ingredient_cost_mmk on public.production_batches
for each row execute function public.correct_batch_total_cost();
