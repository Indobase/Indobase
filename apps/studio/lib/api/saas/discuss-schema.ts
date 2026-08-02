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
