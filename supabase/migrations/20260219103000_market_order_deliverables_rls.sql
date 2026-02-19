-- Market order deliverables + storage RLS
-- Fixes: "new row violates row-level security policy" when seller uploads preview/full files.

begin;

-- --------------------------------------------
-- Table RLS: public.market_order_deliverables
-- --------------------------------------------
alter table if exists public.market_order_deliverables enable row level security;

drop policy if exists market_order_deliverables_select_participants on public.market_order_deliverables;
create policy market_order_deliverables_select_participants
on public.market_order_deliverables
for select
to authenticated
using (
  exists (
    select 1
    from public.market_orders o
    where o.id = market_order_deliverables.order_id
      and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  )
);

drop policy if exists market_order_deliverables_insert_seller on public.market_order_deliverables;
create policy market_order_deliverables_insert_seller
on public.market_order_deliverables
for insert
to authenticated
with check (
  storage_bucket = 'market-deliverables'
  and exists (
    select 1
    from public.market_orders o
    where o.id = market_order_deliverables.order_id
      and o.seller_id = auth.uid()
      and o.status in ('IN_ESCROW', 'OUT_FOR_DELIVERY', 'DELIVERABLE_UPLOADED')
  )
);

drop policy if exists market_order_deliverables_update_seller on public.market_order_deliverables;
create policy market_order_deliverables_update_seller
on public.market_order_deliverables
for update
to authenticated
using (
  exists (
    select 1
    from public.market_orders o
    where o.id = market_order_deliverables.order_id
      and o.seller_id = auth.uid()
      and o.status in ('IN_ESCROW', 'OUT_FOR_DELIVERY', 'DELIVERABLE_UPLOADED')
  )
)
with check (
  storage_bucket = 'market-deliverables'
  and exists (
    select 1
    from public.market_orders o
    where o.id = market_order_deliverables.order_id
      and o.seller_id = auth.uid()
      and o.status in ('IN_ESCROW', 'OUT_FOR_DELIVERY', 'DELIVERABLE_UPLOADED')
  )
);

drop policy if exists market_order_deliverables_delete_seller on public.market_order_deliverables;
create policy market_order_deliverables_delete_seller
on public.market_order_deliverables
for delete
to authenticated
using (
  exists (
    select 1
    from public.market_orders o
    where o.id = market_order_deliverables.order_id
      and o.seller_id = auth.uid()
      and o.status in ('IN_ESCROW', 'OUT_FOR_DELIVERY', 'DELIVERABLE_UPLOADED')
  )
);

-- ------------------------------------------------
-- Storage RLS: storage.objects, bucket market-deliverables
-- ------------------------------------------------
drop policy if exists market_deliverables_objects_select_participants on storage.objects;
create policy market_deliverables_objects_select_participants
on storage.objects
for select
to authenticated
using (
  bucket_id = 'market-deliverables'
  and exists (
    select 1
    from public.market_orders o
    where o.id = substring(name from '^orders/([0-9a-fA-F-]{36})/')::uuid
      and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  )
);

drop policy if exists market_deliverables_objects_insert_seller on storage.objects;
create policy market_deliverables_objects_insert_seller
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'market-deliverables'
  and exists (
    select 1
    from public.market_orders o
    where o.id = substring(name from '^orders/([0-9a-fA-F-]{36})/')::uuid
      and o.seller_id = auth.uid()
      and o.status in ('IN_ESCROW', 'OUT_FOR_DELIVERY', 'DELIVERABLE_UPLOADED')
  )
);

drop policy if exists market_deliverables_objects_update_seller on storage.objects;
create policy market_deliverables_objects_update_seller
on storage.objects
for update
to authenticated
using (
  bucket_id = 'market-deliverables'
  and exists (
    select 1
    from public.market_orders o
    where o.id = substring(name from '^orders/([0-9a-fA-F-]{36})/')::uuid
      and o.seller_id = auth.uid()
      and o.status in ('IN_ESCROW', 'OUT_FOR_DELIVERY', 'DELIVERABLE_UPLOADED')
  )
)
with check (
  bucket_id = 'market-deliverables'
  and exists (
    select 1
    from public.market_orders o
    where o.id = substring(name from '^orders/([0-9a-fA-F-]{36})/')::uuid
      and o.seller_id = auth.uid()
      and o.status in ('IN_ESCROW', 'OUT_FOR_DELIVERY', 'DELIVERABLE_UPLOADED')
  )
);

drop policy if exists market_deliverables_objects_delete_seller on storage.objects;
create policy market_deliverables_objects_delete_seller
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'market-deliverables'
  and exists (
    select 1
    from public.market_orders o
    where o.id = substring(name from '^orders/([0-9a-fA-F-]{36})/')::uuid
      and o.seller_id = auth.uid()
      and o.status in ('IN_ESCROW', 'OUT_FOR_DELIVERY', 'DELIVERABLE_UPLOADED')
  )
);

commit;
