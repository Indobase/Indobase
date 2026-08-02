/**
 * Install Indobase Discuss DDL into a tenant database.
 *
 * Applies the SQL bundled in `discuss-schema-sql.ts` (sourced from
 * `indobase-discuss/db/`). Idempotent — safe on every Discuss open.
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { DISCUSS_SCHEMA_SQL_FILES } from './discuss-schema-sql'
import { resolveEncryptedPgMetaConnectionForProject } from './project-connection'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, unknown>

export type EnsureDiscussSchemaResult = {
  installed: boolean
  alreadyPresent: boolean
}

export async function ensureDiscussSchema({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<EnsureDiscussSchemaResult> {
  const connectionEncrypted = await resolveEncryptedPgMetaConnectionForProject({
    claims,
    ref,
    incomingEncrypted: null,
  })

  const existing = await executeQuery<{ present: boolean }>({
    query: `select to_regnamespace('discuss') is not null as present`,
    headers: { 'x-connection-encrypted': connectionEncrypted },
  })
  if (existing.error) throw existing.error

  const alreadyPresent = Boolean(existing.data?.[0]?.present)
  // Do NOT pass actorId here. executeQuery injects a WITH set_config CTE when actorId is set,
  // which is invalid before DDL (`begin;` / `create` / `do $$`) and surfaces as
  // `syntax error at or near "begin"`. Schema install is a service-role connection, not RLS.
  // Fresh install applies the full pack. Re-open skips DDL re-apply (avoids ownership conflicts
  // when helpers were installed as a different role than pg-meta uses).
  if (!alreadyPresent) {
    for (const sql of DISCUSS_SCHEMA_SQL_FILES) {
      const result = await executeQuery({
        query: sql,
        headers: { 'x-connection-encrypted': connectionEncrypted },
      })
      if (result.error) throw result.error
    }
  }

  // Expose discuss to PostgREST without requiring a stack recreate. Kong/PostgREST may still need
  // a reload for PGRST_DB_SCHEMAS env changes on older stacks; USAGE grants help discovery.
  // 006 also ALTERs authenticator's pgrst.db_schemas (best-effort) and NOTIFYs reload.
  //
  // Bootstrap helpers use SET row_security=off under FORCE RLS. That GUC only works for
  // BYPASSRLS/superuser owners — otherwise Postgres errors with "query would be affected by
  // row-level security…". Fresh CREATE as the tenant DB role leaves helpers tenant-owned;
  // reassign to service_role (tenant is a member; has BYPASSRLS). Grant EXECUTE to CURRENT_USER
  // so Studio's pg-meta SQL path can call ensure_project_setup (still revoked from
  // authenticated/anon/public so PostgREST cannot).
  const grants = await executeQuery({
    query: `
      do $$
      begin
        if exists (select 1 from pg_roles where rolname = 'authenticator') then
          execute 'grant usage on schema discuss to authenticator';
        end if;
        if exists (select 1 from pg_roles where rolname = 'anon') then
          execute 'grant usage on schema discuss to anon';
        end if;
        if exists (select 1 from pg_roles where rolname = 'authenticated') then
          execute 'grant usage on schema discuss to authenticated';
        end if;
        if exists (select 1 from pg_roles where rolname = 'service_role') then
          execute 'grant usage, create on schema discuss to service_role';
          execute 'grant all on all tables in schema discuss to service_role';
          execute 'grant all on all sequences in schema discuss to service_role';
        end if;
      end
      $$;

      -- Discuss uploads: 005 is skipped on re-open when the schema already exists. Always repair
      -- attachment write policies/grants and the Storage bucket so attach does not 404/403.
      do $$
      begin
        if to_regclass('discuss.attachments') is null then
          return;
        end if;
        drop policy if exists attachments_insert on discuss.attachments;
        create policy attachments_insert on discuss.attachments
          for insert with check (
            message_id in (
              select m.id from discuss.messages m
              where m.author_id in (select discuss.current_member_ids())
            )
          );
        drop policy if exists attachments_delete_own on discuss.attachments;
        create policy attachments_delete_own on discuss.attachments
          for delete using (
            message_id in (
              select m.id from discuss.messages m
              where m.author_id in (select discuss.current_member_ids())
            )
          );
        grant select, insert, delete on discuss.attachments to authenticated, service_role;
      exception
        when undefined_table then null;
        when undefined_function then null;
        when insufficient_privilege then null;
      end
      $$;

      do $$
      begin
        if to_regclass('storage.buckets') is null then
          return;
        end if;
        insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        values (
          'discuss',
          'discuss',
          false,
          26214400,
          array[
            'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
            'application/pdf',
            'text/plain', 'text/csv',
            'application/zip',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          ]
        )
        on conflict (id) do update
          set file_size_limit = excluded.file_size_limit,
              allowed_mime_types = excluded.allowed_mime_types;

        drop policy if exists discuss_storage_select on storage.objects;
        create policy discuss_storage_select on storage.objects
          for select to authenticated
          using (bucket_id = 'discuss');

        drop policy if exists discuss_storage_insert on storage.objects;
        create policy discuss_storage_insert on storage.objects
          for insert to authenticated
          with check (
            bucket_id = 'discuss'
            and (storage.foldername(name))[1] = auth.uid()::text
          );

        drop policy if exists discuss_storage_update on storage.objects;
        create policy discuss_storage_update on storage.objects
          for update to authenticated
          using (
            bucket_id = 'discuss'
            and (storage.foldername(name))[1] = auth.uid()::text
          );

        drop policy if exists discuss_storage_delete on storage.objects;
        create policy discuss_storage_delete on storage.objects
          for delete to authenticated
          using (
            bucket_id = 'discuss'
            and (storage.foldername(name))[1] = auth.uid()::text
          );
      exception
        when undefined_table then null;
        when undefined_function then null;
        when insufficient_privilege then null;
      end
      $$;

      do $$
      begin
        if to_regprocedure('discuss.ensure_project_setup(text,uuid,text,text,text)') is null then
          return;
        end if;
        -- Sidebar unread RPC (from 002). Skipped on re-open when schema already present, so
        -- recreate here if missing — otherwise PostgREST 404s and Discuss stays on Opening….
        if to_regprocedure('discuss.unread_counts()') is null then
          execute $fn$
            create function discuss.unread_counts()
            returns table (channel_id uuid, unread bigint, last_message_at timestamptz)
            language sql
            stable
            as $body$
              select
                c.id,
                count(m.id) filter (
                  where m.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz)
                    and m.author_id is distinct from cm.member_id
                ) as unread,
                max(m.created_at) as last_message_at
              from discuss.channels c
              join discuss.channel_members cm
                on cm.channel_id = c.id
               and cm.member_id in (select discuss.current_member_ids())
              left join discuss.read_state rs
                on rs.channel_id = c.id and rs.member_id = cm.member_id
              left join discuss.messages m
                on m.channel_id = c.id
               and m.deleted_at is null
               and m.parent_id is null
              where c.archived_at is null
              group by c.id, cm.member_id, rs.last_read_at
            $body$
          $fn$;
        end if;
        grant execute on function discuss.unread_counts() to authenticated, service_role;
        if exists (select 1 from pg_roles where rolname = 'service_role') then
          alter function discuss.ensure_project_setup(text, uuid, text, text, text) owner to service_role;
          alter function discuss.current_project_ref() owner to service_role;
          alter function discuss.current_member_ids() owner to service_role;
          alter function discuss.my_channel_ids() owner to service_role;
          alter function discuss.my_project_refs() owner to service_role;
          if to_regprocedure('discuss.channel_membership_count(uuid)') is not null then
            alter function discuss.channel_membership_count(uuid) owner to service_role;
          end if;
        end if;
        revoke all on function discuss.ensure_project_setup(text, uuid, text, text, text) from public;
        revoke all on function discuss.ensure_project_setup(text, uuid, text, text, text) from authenticated, anon;
        execute format(
          'grant execute on function discuss.ensure_project_setup(text, uuid, text, text, text) to %I',
          current_user
        );
        if to_regprocedure('discuss.channel_membership_count(uuid)') is not null then
          revoke all on function discuss.channel_membership_count(uuid) from public;
          revoke all on function discuss.channel_membership_count(uuid) from authenticated, anon;
          execute format(
            'grant execute on function discuss.channel_membership_count(uuid) to %I',
            current_user
          );
        end if;
      exception
        when insufficient_privilege then null;
        when undefined_function then null;
        when undefined_object then null;
      end
      $$;

      notify pgrst, 'reload config';
      notify pgrst, 'reload schema';
    `,
    headers: { 'x-connection-encrypted': connectionEncrypted },
  })
  if (grants.error) throw grants.error

  return { installed: true, alreadyPresent }
}
