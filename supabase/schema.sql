-- Optional backend for "Suggest a place": an insert-only table reachable with the publishable (anon) key.
create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 120),
  location text check (char_length(location) <= 200),
  owner_hint text check (char_length(owner_hint) <= 300),
  source_url text check (char_length(source_url) <= 500),
  note text check (char_length(note) <= 1000),
  contact text check (char_length(contact) <= 200),
  status text not null default 'new'
);
alter table public.submissions enable row level security;
create policy "anyone can suggest" on public.submissions for insert to anon with check (status = 'new');
-- No select/update/delete policies: suggestions are only readable from the dashboard / service role.
