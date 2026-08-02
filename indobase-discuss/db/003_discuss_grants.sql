-- Indobase Discuss — grants for PostgREST / Realtime.
--
-- RLS is FORCE-enabled in 001. These grants only let the `authenticated` role *attempt*
-- statements; the policies still decide which rows come back. `anon` gets USAGE only so
-- PostgREST can see the schema when listing exposed namespaces — it cannot read messages.

begin;

grant usage on schema discuss to anon, authenticated, service_role;

grant select on discuss.members to authenticated, service_role;
grant select on discuss.channels to authenticated, service_role;
grant select on discuss.channel_members to authenticated, service_role;
grant select, insert, update on discuss.messages to authenticated, service_role;
grant select, insert, update, delete on discuss.read_state to authenticated, service_role;
grant select on discuss.attachments to authenticated, service_role;

grant execute on function discuss.unread_counts() to authenticated, service_role;
grant execute on function discuss.current_member_ids() to authenticated, service_role;

-- Bootstrap / platform publishers stay locked down (SECURITY DEFINER + revoke in 002).
revoke all on function discuss.ensure_project_setup(text, uuid, text, text, text) from public;
revoke all on function discuss.publish_event(text, text, jsonb) from public;

-- PostgREST discovers schemas via USAGE for authenticator / anon. Keep discuss visible.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    grant usage on schema discuss to authenticator;
  end if;
end
$$;

commit;
