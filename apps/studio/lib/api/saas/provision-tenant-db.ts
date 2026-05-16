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

/** Double-quote an identifier for dynamic DDL (`ROLE`/database names from `safeIdentifier`). */
function quotePgIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`
}

/** Escape a value as a single-quoted Postgres string literal for DDL that cannot use bind params. */
function quotePgLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Login role for tenant CREATE/GRANT/bootstrap DDL (TCP from Studio → `POSTGRES_HOST`).
 * Use `postgres` + `POSTGRES_PASSWORD` by default: it authenticates over the Docker network.
 * `supabase_admin` is often only trusted on 127.0.0.1 inside the DB container, not from Studio.
 */
export function resolveTenantProvisionAdminUser(): string {
  const explicit = process.env.SAAS_TENANT_PROVISION_ADMIN_USER?.trim()
  if (explicit) return explicit
  return (
    process.env.POSTGRES_USER_READ_WRITE?.trim() ||
    process.env.POSTGRES_USER?.trim() ||
    'postgres'
  )
}

async function grantRoleToSupabaseAdminIfPossible(
  client: Client,
  roleIdent: string
): Promise<void> {
  try {
    const supabaseAdminExists = await client.query<{ exists: boolean }>(
      `select exists(select 1 from pg_roles where rolname = 'supabase_admin')`
    )
    if (supabaseAdminExists.rows[0]?.exists) {
      await client.query(`GRANT ${roleIdent} TO supabase_admin`)
    }
  } catch (e) {
    // Non-superuser `postgres` cannot grant to the reserved `supabase_admin` role.
    console.warn('[provision-tenant-db] GRANT tenant role to supabase_admin skipped: %O', e)
  }
}

/**
 * MVP provisioning: creates a tenant database and login role on the same Postgres cluster.
 *
 * Requires a superuser/createdb-capable connection (`resolveTenantProvisionAdminUser()` + POSTGRES_PASSWORD).
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
    //
    // IMPORTANT: Do not put `$1`, `$2`, … inside dollar-quoted `DO $$ … $$` bodies — those are
    // literals, not extended-query placeholders. node-postgres would send bind parameters while
    // Postgres parses zero placeholders → "bind message supplies N parameters … requires 0".
    const roleExists = await client.query<{ exists: boolean }>(
      'select exists(select 1 from pg_roles where rolname = $1)',
      [roleName]
    )
    const roleIdent = quotePgIdent(roleName)
    const roleLit = quotePgLiteral(rolePassword)
    if (!roleExists.rows[0]?.exists) {
      await client.query(
        `create role ${roleIdent} login password ${roleLit} nocreatedb nocreaterole nosuperuser`
      )
    } else {
      await client.query(`alter role ${roleIdent} login password ${roleLit}`)
    }

    const adminIdent = quotePgIdent(adminUser)
    // Grant before CREATE DATABASE: on Supabase images `postgres` is not superuser, so
    // `CREATE DATABASE ... OWNER <tenant>` requires membership in the tenant role first.
    await client.query(`GRANT ${roleIdent} TO ${adminIdent}`)
    await grantRoleToSupabaseAdminIfPossible(client, roleIdent)

    const dbExists = await client.query<{ exists: boolean }>(
      'select exists(select 1 from pg_database where datname = $1)',
      [dbName]
    )
    if (!dbExists.rows[0]?.exists) {
      await client.query(`create database ${quotePgIdent(dbName)} owner ${roleIdent}`)
    }
  } finally {
    await client.end()
  }

  const connectionString = `postgresql://${encodeURIComponent(roleName)}:${encodeURIComponent(
    rolePassword
  )}@${host}:${port}/${dbName}`

  return { dbName, roleName, rolePassword, connectionString }
}

/** Set tenant login role password (e.g. user-chosen DB password from project creation UI). */
export async function setTenantRolePassword({
  host,
  port,
  adminUser,
  adminPassword,
  dbName,
  tenantRoleName,
  password,
}: {
  host: string
  port: number
  adminUser: string
  adminPassword: string
  dbName: string
  tenantRoleName: string
  password: string
}): Promise<void> {
  if (!/^[a-z][a-z0-9_]{0,62}$/i.test(tenantRoleName)) {
    throw new Error('Invalid tenant role name')
  }
  const adminConn = `postgresql://${encodeURIComponent(adminUser)}:${encodeURIComponent(
    adminPassword
  )}@${host}:${port}/postgres`
  const client = new Client({ connectionString: adminConn })
  await client.connect()
  try {
    const roleIdent = quotePgIdent(tenantRoleName)
    const roleLit = quotePgLiteral(password)
    await client.query(`alter role ${roleIdent} login password ${roleLit}`)
  } finally {
    await client.end()
  }
}

/**
 * Best-effort extensions on the new tenant DB (connected as superuser/admin).
 * Failures are logged but do not fail provisioning — some images restrict extensions.
 */
export async function bootstrapTenantDatabaseExtensions({
  host,
  port,
  adminUser,
  adminPassword,
  dbName,
}: {
  host: string
  port: number
  adminUser: string
  adminPassword: string
  dbName: string
}): Promise<void> {
  const adminConn = `postgresql://${encodeURIComponent(adminUser)}:${encodeURIComponent(
    adminPassword
  )}@${host}:${port}/${dbName}`

  const client = new Client({ connectionString: adminConn })
  await client.connect()
  try {
    try {
      await client.query('create extension if not exists "uuid-ossp"')
    } catch (e) {
      console.warn('[provision-tenant-db] optional extension "uuid-ossp" skipped: %O', e)
    }
    try {
      await client.query('create extension if not exists pgcrypto')
    } catch (e) {
      console.warn('[provision-tenant-db] optional extension pgcrypto skipped: %O', e)
    }
  } finally {
    await client.end()
  }
}

/**
 * Minimal roles for PostgREST JWT role switching + GoTrue on a fresh tenant database.
 * Connects as admin to the tenant DB (same as extension bootstrap).
 */
export async function bootstrapMinimalSupabaseRoles({
  host,
  port,
  adminUser,
  adminPassword,
  dbName,
  tenantRoleName,
}: {
  host: string
  port: number
  adminUser: string
  adminPassword: string
  dbName: string
  tenantRoleName: string
}): Promise<void> {
  if (!/^[a-z][a-z0-9_]{0,62}$/i.test(tenantRoleName)) {
    throw new Error('Invalid tenant role name for bootstrap')
  }

  const adminConn = `postgresql://${encodeURIComponent(adminUser)}:${encodeURIComponent(
    adminPassword
  )}@${host}:${port}/${dbName}`

  const client = new Client({ connectionString: adminConn })
  await client.connect()
  try {
    await client.query(`
      do $do$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon nologin noinherit;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin noinherit;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role nologin noinherit bypassrls;
        end if;
      end
      $do$;
    `)
    await client.query('grant usage on schema public to anon, authenticated, service_role')
    // `tenantRoleName` is validated above — safe as an unquoted SQL identifier.
    await client.query(`grant anon, authenticated, service_role to ${tenantRoleName}`)
  } finally {
    await client.end()
  }
}

const DATA_PLANE_AUX_ROLES = [
  'authenticator',
  'supabase_admin',
  'supabase_auth_admin',
  'supabase_storage_admin',
] as const

/**
 * Supabase-style auxiliary roles + empty auth/storage/_realtime/graphql_public schemas.
 * Uses the same password as the tenant login role for all aux roles (self-host MVP).
 * GoTrue and storage-api apply their own SQL migrations on first startup.
 */
export async function bootstrapTenantDataPlaneSchemas({
  host,
  port,
  adminUser,
  adminPassword,
  dbName,
  tenantRolePassword,
  auxiliaryRolePassword,
}: {
  host: string
  port: number
  adminUser: string
  adminPassword: string
  dbName: string
  tenantRolePassword: string
  /** Password for authenticator / supabase_* roles (defaults to tenant role password). */
  auxiliaryRolePassword?: string
}): Promise<void> {
  if (!/^[a-z][a-z0-9_]{0,62}$/i.test(dbName)) {
    throw new Error('Invalid database name for data-plane bootstrap')
  }

  const auxPass = (auxiliaryRolePassword ?? tenantRolePassword).trim() || tenantRolePassword

  const adminConn = `postgresql://${encodeURIComponent(adminUser)}:${encodeURIComponent(
    adminPassword
  )}@${host}:${port}/${dbName}`

  const client = new Client({ connectionString: adminConn })
  await client.connect()
  try {
    const superRes = await client.query<{ rolsuper: boolean }>(
      `select rolsuper from pg_roles where rolname = current_user`
    )
    const isSuperuser = superRes.rows[0]?.rolsuper === true

    const pwLit = quotePgLiteral(auxPass)
    for (const role of DATA_PLANE_AUX_ROLES) {
      const exists = await client.query<{ exists: boolean }>(
        'select exists(select 1 from pg_roles where rolname = $1)',
        [role]
      )
      const roleExists = Boolean(exists.rows[0]?.exists)
      if (!roleExists) {
        if (!isSuperuser) {
          console.warn(
            '[provision-tenant-db] aux role %s missing on cluster; skip create (non-superuser provision admin)',
            role
          )
          continue
        }
        await client.query(`create role ${quotePgIdent(role)} login`)
        await client.query(`alter role ${quotePgIdent(role)} password ${pwLit}`)
      } else if (isSuperuser) {
        await client.query(`alter role ${quotePgIdent(role)} password ${pwLit}`)
      }
      // Cluster-wide reserved roles already exist: non-superuser cannot alter their passwords.
    }

    const dbLit = `"${dbName.replace(/"/g, '""')}"`
    await client.query(
      `grant connect on database ${dbLit} to authenticator, supabase_admin, supabase_auth_admin, supabase_storage_admin`
    )

    await client.query(
      'grant usage on schema public to authenticator, supabase_admin, supabase_auth_admin, supabase_storage_admin'
    )
    await client.query('grant anon, authenticated, service_role to authenticator')

    await client.query('create schema if not exists auth')
    await client.query('create schema if not exists storage')
    await client.query('create schema if not exists _realtime')
    await client.query('create schema if not exists graphql_public')

    if (isSuperuser) {
      await client.query('alter schema auth owner to supabase_auth_admin')
      await client.query('alter schema storage owner to supabase_storage_admin')
      await client.query('alter schema _realtime owner to supabase_admin')
      await client.query('alter schema graphql_public owner to supabase_admin')
    } else {
      // Non-superuser provision admin (typical `postgres` over TCP): cannot transfer ownership
      // to reserved Supabase roles; grant full schema access instead.
      await client.query(
        'grant all on schema auth to supabase_auth_admin, supabase_admin, authenticator'
      )
      await client.query(
        'grant all on schema storage to supabase_storage_admin, supabase_admin, authenticator'
      )
      await client.query('grant all on schema _realtime to supabase_admin, authenticator')
      await client.query(
        'grant all on schema graphql_public to supabase_admin, anon, authenticated, service_role, authenticator'
      )
    }

    await client.query('grant usage on schema auth to supabase_auth_admin, anon, authenticated, service_role')
    await client.query(
      'grant usage on schema storage to supabase_storage_admin, anon, authenticated, service_role'
    )
    await client.query('grant usage on schema graphql_public to anon, authenticated, service_role')
    await client.query('grant all on schema _realtime to supabase_admin')

    await client.query(
      'grant usage on schema auth, storage, graphql_public to authenticator'
    )

    const defaultPrivRole = isSuperuser ? 'supabase_auth_admin' : adminUser
    const storagePrivRole = isSuperuser ? 'supabase_storage_admin' : adminUser
    await client.query(
      `alter default privileges for role ${quotePgIdent(defaultPrivRole)} in schema auth grant select on tables to anon, authenticated`
    )
    await client.query(
      `alter default privileges for role ${quotePgIdent(defaultPrivRole)} in schema auth grant all on tables to service_role`
    )
    await client.query(
      `alter default privileges for role ${quotePgIdent(storagePrivRole)} in schema storage grant select on tables to anon, authenticated`
    )
    await client.query(
      `alter default privileges for role ${quotePgIdent(storagePrivRole)} in schema storage grant all on tables to service_role`
    )

    try {
      await client.query('create schema if not exists pgbouncer')
      await client.query(`
        create or replace function pgbouncer.get_auth(p_usename text)
        returns table(username text, password text)
        language sql
        security definer
        set search_path = pg_catalog
        as $f$
          select r.rolname::text, coalesce(r.rolpassword::text, '')::text
          from pg_catalog.pg_authid r
          where r.rolname = p_usename::name
        $f$
      `)
      await client.query('revoke all on function pgbouncer.get_auth(text) from public')
      await client.query(
        'grant execute on function pgbouncer.get_auth(text) to supabase_admin, authenticator, postgres'
      )
    } catch {
      // Optional: requires read on pg_authid; skip if bootstrap role cannot install Supavisor auth_query support.
    }
  } finally {
    await client.end()
  }
}

/**
 * Re-run role + schema bootstrap for an existing dedicated tenant DB (decrypt connection string in Studio).
 * Uses POSTGRES_* admin credentials; parses host/port/db/user/password from the tenant URL.
 */
export async function runTenantDataPlaneBootstrapFromConnectionString(
  tenantConnectionUrl: string
): Promise<{ dbName: string; tenantRole: string }> {
  const normalized = tenantConnectionUrl.trim().replace(/^postgres:\/\//, 'postgresql://')
  const u = new URL(normalized)
  const dbName = u.pathname.replace(/^\//, '')
  if (!dbName) throw new Error('Tenant connection URL is missing database name')
  const host = u.hostname
  const port = parseInt(u.port || '5432', 10)
  const tenantRole = decodeURIComponent(u.username)
  const tenantRolePassword = u.password ? decodeURIComponent(u.password) : ''
  if (!tenantRolePassword) throw new Error('Tenant connection URL is missing password')

  const adminPassword = process.env.POSTGRES_PASSWORD ?? ''
  const adminUser = resolveTenantProvisionAdminUser()
  if (!adminPassword) throw new Error('POSTGRES_PASSWORD is required for tenant DB bootstrap')

  const adminConn = `postgresql://${encodeURIComponent(adminUser)}:${encodeURIComponent(
    adminPassword
  )}@${host}:${port}/postgres`
  const grantClient = new Client({ connectionString: adminConn })
  await grantClient.connect()
  try {
    const roleIdent = quotePgIdent(tenantRole)
    const adminIdent = quotePgIdent(adminUser)
    await grantClient.query(`GRANT ${roleIdent} TO ${adminIdent}`)
    await grantRoleToSupabaseAdminIfPossible(grantClient, roleIdent)
  } finally {
    await grantClient.end()
  }

  await bootstrapMinimalSupabaseRoles({
    host,
    port,
    adminUser,
    adminPassword,
    dbName,
    tenantRoleName: tenantRole,
  })
  await bootstrapTenantDataPlaneSchemas({
    host,
    port,
    adminUser,
    adminPassword,
    dbName,
    tenantRolePassword,
    auxiliaryRolePassword:
      process.env.SAAS_DATA_PLANE_AUX_ROLE_PASSWORD?.trim() || tenantRolePassword,
  })
  return { dbName, tenantRole }
}

