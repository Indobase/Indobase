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

      do $$
      begin
        if to_regprocedure('discuss.ensure_project_setup(text,uuid,text,text,text)') is null then
          return;
        end if;
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
