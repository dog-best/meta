-- Ensure market listings bucket exists and is public for listing images.
begin;

insert into storage.buckets (id, name, public)
values ('market-listings', 'market-listings', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

commit;
