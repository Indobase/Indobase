-- Idempotent fixes for Adral on Indobase tenant DB (run as postgres).
-- Remaining items from Supabase migrations that fail on multi-tenant Postgres.

-- 1) Signup → profile trigger (requires auth schema owner)
\set ON_ERROR_STOP on

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    plan,
    credits_used,
    credits_period_start,
    session_usage,
    session_started_at,
    weekly_usage,
    weekly_started_at,
    tokens_used,
    tokens_period_start
  )
  values (
    new.id,
    'free_trial',
    0,
    date_trunc('month', now())::date,
    0,
    now(),
    0,
    now(),
    0,
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

-- 2) Canonical plan names (20260521150000)
update public.profiles set plan = 'free_trial' where plan in ('free', 'trial');
update public.profiles set plan = 'adral_plus' where plan = 'plus';
update public.profiles
set plan = 'adral_pro'
where plan = 'pro' and role is distinct from 'superadmin';

-- 3) pg_net in tenant DB (for optional in-DB HTTP; cron itself lives in postgres DB)
create extension if not exists pg_net with schema extensions;
