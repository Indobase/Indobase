import { POSTGRES_USER_READ_WRITE } from './constants'
import { executeQuery } from './query'

/**
 * Studio connects to the control-plane DB as POSTGRES_USER_READ_WRITE (often `postgres`)
 * while legacy installs may have created `saas.*` objects as `supabase_admin`.
 * Without explicit grants, `postgres` hits "permission denied for schema saas".
 *
 * Non-superuser `postgres` cannot GRANT on objects it does not own; production DBs should
 * expose `saas.grant_studio_access()` (see migration 20260515170000) which runs as the
 * schema owner via SECURITY DEFINER.
 *
 * Idempotent: safe to run on every ensureSaasTables().
 */

/** Allowed PostgreSQL role names we ever emit into GRANT statements (avoid identifier injection). */
function assertPgRoleName(role: string): string {
  const trimmed = role.trim()
  if (!trimmed || !/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(trimmed)) {
    throw new Error(`Invalid PostgreSQL role identifier: ${role}`)
  }
  return trimmed
}

function uniquePgRoles(roles: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of roles) {
    const r = assertPgRoleName(raw)
    if (seen.has(r)) continue
    seen.add(r)
    out.push(r)
  }
  return out
}

/** Dynamic GRANT helper for bootstrap before migration `saas.grant_studio_access()` exists. */
export function buildSaasStudioDbPrivilegesSql(roles?: string[]): string {
  const targets = uniquePgRoles(roles ?? ['postgres', 'supabase_admin', POSTGRES_USER_READ_WRITE])
  const literals = targets.map((r) => `'${r.replace(/'/g, "''")}'`).join(', ')
  return `
DO $studio_grants$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[${literals}]::text[]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT USAGE, CREATE ON SCHEMA saas TO %I', r);
      EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA saas TO %I', r);
      EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA saas TO %I', r);
      EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA saas TO %I', r);
    END IF;
  END LOOP;
END
$studio_grants$;
`
}

/** @deprecated Use buildSaasStudioDbPrivilegesSql() — kept for grep/docs parity with migrations. */
export const SAAS_STUDIO_DB_PRIVILEGES_SQL = buildSaasStudioDbPrivilegesSql()

async function grantStudioPrivilegesViaSecurityDefinerFn(): Promise<boolean> {
  const probe = await executeQuery<{ exists: boolean }>({
    query: `
      select exists(
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'saas'
          and p.proname = 'grant_studio_access'
      ) as exists
    `,
  })
  if (probe.error) throw probe.error
  return Boolean(probe.data?.[0]?.exists)
}

export async function ensureSaasStudioDbPrivileges(): Promise<void> {
  const hasFn = await grantStudioPrivilegesViaSecurityDefinerFn()

  if (hasFn) {
    const boosted = await executeQuery({ query: `select saas.grant_studio_access()` })
    if (boosted.error) throw boosted.error

    const rw = assertPgRoleName(POSTGRES_USER_READ_WRITE)
    if (rw !== 'postgres' && rw !== 'supabase_admin') {
      const extra = await executeQuery({ query: buildSaasStudioDbPrivilegesSql([rw]) })
      if (extra.error) throw extra.error
    }
    return
  }

  const applied = await executeQuery({ query: buildSaasStudioDbPrivilegesSql() })
  if (applied.error) throw applied.error
}
