create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.todos enable row level security;

create policy "Users read own todos" on public.todos for select using (auth.uid() = user_id);
create policy "Users insert own todos" on public.todos for insert with check (auth.uid() = user_id);
create policy "Users update own todos" on public.todos for update using (auth.uid() = user_id);
create policy "Users delete own todos" on public.todos for delete using (auth.uid() = user_id);
