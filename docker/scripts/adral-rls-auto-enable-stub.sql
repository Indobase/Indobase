-- Satisfies 20260520190000_revoke_rls_auto_enable_execute.sql on Indobase (function absent by default).
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
as $$
begin
  null;
end;
$$;

revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
revoke all on function public.rls_auto_enable() from authenticated;
