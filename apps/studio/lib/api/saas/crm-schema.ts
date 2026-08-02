/**
 * Install Indobase CRM DDL into a tenant database.
 * Idempotent — safe on every CRM open.
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { CRM_SCHEMA_SQL_FILES } from './crm-schema-sql'
import { getGotrueUserId } from './platform'
import { resolveEncryptedPgMetaConnectionForProject } from './project-connection'
import { executeQuery } from './query'

type Claims = JwtPayload & Record<string, unknown>

export type EnsureCrmSchemaResult = {
  installed: boolean
  alreadyPresent: boolean
}

export async function ensureCrmSchema({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<EnsureCrmSchemaResult> {
  const gotrueId = getGotrueUserId(claims)
  const connectionEncrypted = await resolveEncryptedPgMetaConnectionForProject({
    claims,
    ref,
    incomingEncrypted: null,
  })

  const existing = await executeQuery<{ present: boolean }>({
    query: `select to_regnamespace('crm') is not null as present`,
    headers: { 'x-connection-encrypted': connectionEncrypted },
  })
  if (existing.error) throw existing.error

  const alreadyPresent = Boolean(existing.data?.[0]?.present)

  // Do NOT pass actorId: executeQuery wraps queries in a WITH set_config CTE, which breaks DDL.
  // Fresh install: apply full pack. Re-open: schema already installed (repairs applied out-of-band
  // or on first open); skip re-apply to avoid ownership / FORCE RLS fights with pg-meta role.
  if (!alreadyPresent) {
    for (const sql of CRM_SCHEMA_SQL_FILES) {
      const result = await executeQuery({
        query: sql,
        headers: { 'x-connection-encrypted': connectionEncrypted },
      })
      if (result.error) throw result.error
    }
  }

  const grants = await executeQuery({
    query: `
      do $$
      begin
        if exists (select 1 from pg_roles where rolname = 'authenticator') then
          execute 'grant usage on schema crm to authenticator';
        end if;
        if exists (select 1 from pg_roles where rolname = 'anon') then
          execute 'grant usage on schema crm to anon';
        end if;
        if exists (select 1 from pg_roles where rolname = 'authenticated') then
          execute 'grant usage on schema crm to authenticated';
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
