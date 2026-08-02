/**
 * Install Indobase Discuss DDL into a tenant database.
 *
 * Applies the SQL bundled in `discuss-schema-sql.ts` (sourced from
 * `indobase-discuss/db/`). Idempotent — safe on every Discuss open.
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { DISCUSS_SCHEMA_SQL_FILES } from './discuss-schema-sql'
import { getGotrueUserId } from './platform'
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
  const gotrueId = getGotrueUserId(claims)
  const connectionEncrypted = await resolveEncryptedPgMetaConnectionForProject({
    claims,
    ref,
    incomingEncrypted: null,
  })

  const existing = await executeQuery<{ present: boolean }>({
    query: `select to_regnamespace('discuss') is not null as present`,
    headers: { 'x-connection-encrypted': connectionEncrypted },
    actorId: gotrueId,
  })
  if (existing.error) throw existing.error

  const alreadyPresent = Boolean(existing.data?.[0]?.present)
  // Always re-apply: CREATE IF NOT EXISTS / OR REPLACE / grants are idempotent, and grants may
  // have been missing on an earlier partial install.
  // Do NOT pass actorId here. executeQuery injects a WITH set_config CTE when actorId is set,
  // which is invalid before DDL (`begin;` / `create` / `do $$`) and surfaces as
  // `syntax error at or near "begin"`. Schema install is a service-role connection, not RLS.
  // Do NOT `set row_security = off` here either — that GUC means "error if RLS would apply",
  // which produces `query would be affected by row-level security policy`.
  // When the schema already exists, only re-apply the latest repair packs (008+) so we do not
  // re-hit non-idempotent CREATE POLICY from early files on every Discuss open.
  const sqlFiles = alreadyPresent
    ? DISCUSS_SCHEMA_SQL_FILES.filter((_, i) => i >= DISCUSS_SCHEMA_SQL_FILES.length - 1)
    : [...DISCUSS_SCHEMA_SQL_FILES]
  for (const sql of sqlFiles) {
    const result = await executeQuery({
      query: sql,
      headers: { 'x-connection-encrypted': connectionEncrypted },
    })
    if (result.error) {
      const message =
        result.error instanceof Error ? result.error.message : String(result.error)
      // Repair packs may try CREATE OR REPLACE on helpers owned by a different role than the
      // pg-meta connection (e.g. after a manual postgres apply). Schema is already present.
      if (
        alreadyPresent &&
        (/must be owner of function/i.test(message) ||
          /query would be affected by row-level security/i.test(message) ||
          /already exists/i.test(message))
      ) {
        continue
      }
      throw result.error
    }
  }

  // Expose discuss to PostgREST without requiring a stack recreate. Kong/PostgREST may still need
  // a reload for PGRST_DB_SCHEMAS env changes on older stacks; USAGE grants help discovery.
  // 006 also ALTERs authenticator's pgrst.db_schemas (best-effort) and NOTIFYs reload.
  await executeQuery({
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

  return { installed: true, alreadyPresent }
}
