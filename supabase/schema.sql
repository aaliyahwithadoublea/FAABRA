-- FAABRA GLOBAL TRADE — free Supabase setup
-- Run once: Supabase Dashboard → SQL Editor → New query → paste → Run

create table if not exists public.books (
  id text primary key default 'faabra',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  device_id text
);

alter table public.books enable row level security;

drop policy if exists "faabra_books_read" on public.books;
drop policy if exists "faabra_books_write" on public.books;
drop policy if exists "faabra_books_update" on public.books;

-- One owner / one business on the free plan: key holders can read and write.
create policy "faabra_books_read" on public.books
  for select using (true);

create policy "faabra_books_write" on public.books
  for insert with check (true);

create policy "faabra_books_update" on public.books
  for update using (true);

-- Live updates when another phone or computer saves
do $$
begin
  alter publication supabase_realtime add table public.books;
exception
  when duplicate_object then null;
  when others then null;
end $$;
