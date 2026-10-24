-- Bakery Book: owner-scoped, audited test-data reset.
-- The RPC is additionally protected by the Next.js server feature flag and
-- requires a freshly authenticated access token.

create table if not exists public.data_reset_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  reset_mode text not null check (reset_mode in ('transactions', 'everything')),
  reset_at timestamptz not null default now()
);

alter table public.data_reset_events enable row level security;
drop policy if exists "reset_events_owner_read" on public.data_reset_events;
create policy "reset_events_owner_read" on public.data_reset_events
  for select to authenticated
  using (owner_id = auth.uid());
grant select on public.data_reset_events to authenticated;

create or replace function public.reset_bakery_data(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_stock integer := 0;
  v_sales integer := 0;
  v_batches integer := 0;
  v_purchases integer := 0;
  v_expenses integer := 0;
begin
  if v_owner is null then raise exception 'Authentication is required'; end if;
  if p_mode not in ('transactions', 'everything') then raise exception 'Invalid reset mode'; end if;

  delete from public.stock_movements where owner_id = v_owner;
  get diagnostics v_stock = row_count;
  delete from public.sales where owner_id = v_owner;
  get diagnostics v_sales = row_count;
  delete from public.production_batches where owner_id = v_owner;
  get diagnostics v_batches = row_count;
  delete from public.purchases where owner_id = v_owner;
  get diagnostics v_purchases = row_count;
  delete from public.expenses where owner_id = v_owner;
  get diagnostics v_expenses = row_count;

  if p_mode = 'everything' then
    delete from public.recipes where owner_id = v_owner;
    delete from public.products where owner_id = v_owner;
    delete from public.ingredients where owner_id = v_owner;
    delete from public.suppliers where owner_id = v_owner;
  end if;

  insert into public.data_reset_events (owner_id, reset_mode) values (v_owner, p_mode);

  return jsonb_build_object(
    'stockMovements', v_stock,
    'sales', v_sales,
    'batches', v_batches,
    'purchases', v_purchases,
    'expenses', v_expenses,
    'mode', p_mode
  );
end;
$$;

revoke all on function public.reset_bakery_data(text) from public;
grant execute on function public.reset_bakery_data(text) to authenticated;
