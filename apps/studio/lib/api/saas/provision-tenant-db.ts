import { Client } from 'pg'

import { makeRandomString } from 'lib/helpers'

type ProvisionResult = {
  dbName: string
  roleName: string
  rolePassword: string
  connectionString: string
}

function safeIdentifier(prefix: string, ref: string) {
  // `ref` is already constrained (uniqueProjectRef), but keep a defensive transform.
  const cleaned = ref.toLowerCase().replace(/[^a-z0-9_]+/g, '_')
  return `${prefix}_${cleaned}`
}

/**
 * MVP provisioning: creates a tenant database and login role on the same Postgres cluster.
 *
 * Requires a superuser/createdb-capable connection (defaults to `postgres` + POSTGRES_PASSWORD).
 */
export async function provisionTenantDatabase({
  projectRef,
  host,
  port,
  adminUser,
  adminPassword,
}: {
  projectRef: string
  host: string
  port: number
  adminUser: string
  adminPassword: string
}): Promise<ProvisionResult> {
  const roleName = safeIdentifier('tenant', projectRef)
  const dbName = safeIdentifier('tenantdb', projectRef)
  const rolePassword = makeRandomString(40)

  const adminConn = `postgresql://${encodeURIComponent(adminUser)}:${encodeURIComponent(
    adminPassword
  )}@${host}:${port}/postgres`

  const client = new Client({ connectionString: adminConn })
  await client.connect()

  try {
    // Idempotent-ish: if role/db exist, keep going (so retries don’t brick the project).
    await client.query(`do $$
begin
  if not exists (select 1 from pg_roles where rolname = $1) then
    execute format('create role %I login password %L nocreatedb nocreaterole nosuperuser', $1, $2);
  else
    execute format('alter role %I login password %L', $1, $2);
  end if;
end
$$;`, [roleName, rolePassword])

    await client.query(`do $$
begin
  if not exists (select 1 from pg_database where datname = $1) then
    execute format('create database %I owner %I', $1, $2);
  end if;
end
$$;`, [dbName, roleName])
  } finally {
    await client.end()
  }

  const connectionString = `postgresql://${encodeURIComponent(roleName)}:${encodeURIComponent(
    rolePassword
  )}@${host}:${port}/${dbName}`

  return { dbName, roleName, rolePassword, connectionString }
}

