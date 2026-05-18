-- Brute-force lockout for platform GoTrue via password_verification_attempt hook.
-- Apply on control-plane postgres:
--   docker exec -i indobase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < docker/volumes/db/migrations/20260517120000_auth_password_lockout_hook.sql

create table if not exists public.password_failed_verification_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  failed_count int not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

create or replace function public.password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := nullif(event ->> 'user_id', '')::uuid;
  is_valid boolean := coalesce((event ->> 'valid')::boolean, false);
  max_attempts constant int := 5;
  lock_minutes constant int := 15;
  cnt int;
  win_start timestamptz;
  locked timestamptz;
begin
  if uid is null then
    return jsonb_build_object('decision', 'continue');
  end if;

  if is_valid then
    delete from public.password_failed_verification_attempts where user_id = uid;
    return jsonb_build_object('decision', 'continue');
  end if;

  select failed_count, window_started_at, locked_until
    into cnt, win_start, locked
    from public.password_failed_verification_attempts
    where user_id = uid;

  if locked is not null and locked > now() then
    return jsonb_build_object(
      'decision', 'reject',
      'message', 'Too many failed sign-in attempts. Account temporarily locked.',
      'should_logout_user', false
    );
  end if;

  if cnt is null then
    insert into public.password_failed_verification_attempts (user_id, failed_count, window_started_at)
    values (uid, 1, now());
    return jsonb_build_object('decision', 'continue');
  end if;

  if win_start < now() - make_interval(mins => lock_minutes) then
    update public.password_failed_verification_attempts
      set failed_count = 1,
          window_started_at = now(),
          locked_until = null
      where user_id = uid;
    return jsonb_build_object('decision', 'continue');
  end if;

  cnt := cnt + 1;
  update public.password_failed_verification_attempts
    set failed_count = cnt
    where user_id = uid;

  if cnt >= max_attempts then
    update public.password_failed_verification_attempts
      set locked_until = now() + make_interval(mins => lock_minutes)
      where user_id = uid;
    return jsonb_build_object(
      'decision', 'reject',
      'message', 'Too many failed sign-in attempts. Account temporarily locked.',
      'should_logout_user', false
    );
  end if;

  return jsonb_build_object('decision', 'continue');
end;
$$;

grant all on table public.password_failed_verification_attempts to supabase_auth_admin;
revoke all on table public.password_failed_verification_attempts from authenticated, anon, public;

grant execute on function public.password_verification_attempt(jsonb) to supabase_auth_admin;
grant execute on function public.password_verification_attempt(jsonb) to postgres;
