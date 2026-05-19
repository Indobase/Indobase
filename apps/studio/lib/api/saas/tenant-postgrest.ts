import { Client } from 'pg'

import { resolveTenantProvisionAdminUser } from './provision-tenant-db'

/** SQL run after DDL so new public tables are visible to PostgREST and API roles. */
export const TENANT_PUBLIC_API_GRANTS_SQL = `
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
`.trim()

export const TENANT_POSTGREST_RELOAD_SQL = `notify pgrst, 'reload schema';`

export function sqlLooksLikePublicDdl(query: string): boolean {
  const q = query.trim()
  return /^\s*create\s+table\b/i.test(q) || /^\s*alter\s+table\s+public\./i.test(q)
}

/**
 * Grant API roles access to public schema objects and ask PostgREST to reload its schema cache.
 */
export async function refreshTenantPublicApiExposure({
  host,
  port,
  dbName,
  adminPassword,
}: {
  host: string
  port: number
  dbName: string
  adminPassword: string
}): Promise<void> {
  const adminUser = resolveTenantProvisionAdminUser()
  const client = new Client({
    connectionString: `postgresql://${encodeURIComponent(adminUser)}:${encodeURIComponent(
      adminPassword
    )}@${host}:${port}/${dbName}`,
  })
  await client.connect()
  try {
    await client.query(TENANT_PUBLIC_API_GRANTS_SQL)
    await client.query(TENANT_POSTGREST_RELOAD_SQL)
  } finally {
    await client.end()
  }
}
