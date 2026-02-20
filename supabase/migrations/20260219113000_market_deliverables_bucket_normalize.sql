-- Normalize deliverable bucket references and ensure bucket exists.
-- Fixes legacy rows that can cause "Bucket not found" on signed download URLs.

begin;

-- Ensure target bucket exists.
insert into storage.buckets (id, name, public)
values ('market-deliverables', 'market-deliverables', false)
on conflict (id) do update
set name = excluded.name;

-- Normalize existing rows to canonical bucket id.
update public.market_order_deliverables
set storage_bucket = 'market-deliverables'
where coalesce(trim(storage_bucket), '') = ''
   or trim(storage_bucket) <> 'market-deliverables';

commit;
