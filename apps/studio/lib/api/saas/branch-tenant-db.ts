import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client } from 'pg'

import type { Claims } from './platform'
import { getGotrueUserId } from './platform'
import { decryptString } from './util'
import { executeQuery } from './query'
import { encryptString } from './util'

const execFileAsync = promisify(execFile)

/** Schemas compared/copied for preview branches (matches Studio type generation defaults). */
export const DEFAULT_BRANCH_SCHEMAS = ['public', 'graphql_public', 'storage'] as const

const SYSTEM_SCHEMAS = new Set([
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
  'auth',
  'extensions',
  'vault',
  'graphql',
  'realtime',
  'supabase_functions',
  'supabase_migrations',
  '_realtime',
  '_analytics',
  'cron',
  'net',
  'pgsodium',
  'pgsodium_masks',
  'pgbouncer',
  'pgtle',
])

export function parseIncludedSchemas(raw?: string | string[]): string[] {
  const value = Array.isArray(raw) ? raw.join(',') : raw
  if (!value?.trim()) return [...DEFAULT_BRANCH_SCHEMAS]
  return [...new Set(value.split(',').map((s) => s.trim()).filter(Boolean))]
}

export function tenantPgMetaHeaders(tenantDatabaseUrl: string): HeadersInit {
  return { 'x-connection-encrypted': encryptString(tenantDatabaseUrl) }
}

type PgConnParts = {
  host: string
  port: string
  user: string
  password: string
  database: string
}

export function parsePostgresConnectionUrl(connectionUrl: string): PgConnParts {
  const normalized = connectionUrl.trim().replace(/^postgres:\/\//, 'postgresql://')
  const u = new URL(normalized)
  const database = u.pathname.replace(/^\//, '')
  if (!database) throw new Error('Tenant connection URL is missing database name')
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: u.password ? decodeURIComponent(u.password) : '',
    database,
  }
}

function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`
}

function pgDumpEnv(password: string) {
  return { ...process.env, PGPASSWORD: password }
}

function pgDumpBaseArgs(parts: PgConnParts): string[] {
  return [
    '-h',
    parts.host,
    '-p',
    parts.port,
    '-U',
    parts.user,
    '-d',
    parts.database,
    '--no-password',
  ]
}

async function isPgDumpAvailable(): Promise<boolean> {
  try {
    await execFileAsync('pg_dump', ['--version'], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

async function runPgDump(parts: PgConnParts, extraArgs: string[]): Promise<string | null> {
  if (!(await isPgDumpAvailable())) return null
  try {
    const { stdout } = await execFileAsync(
      'pg_dump',
      [...pgDumpBaseArgs(parts), ...extraArgs],
      {
        env: pgDumpEnv(parts.password),
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120_000,
      }
    )
    return stdout
  } catch (e) {
    console.warn('[branch-tenant-db] pg_dump failed: %O', e)
    return null
  }
}

async function runPsql(parts: PgConnParts, sql: string): Promise<boolean> {
  try {
    await execFileAsync('psql', [...pgDumpBaseArgs(parts), '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
      env: pgDumpEnv(parts.password),
      input: sql,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    })
    return true
  } catch (e) {
    console.warn('[branch-tenant-db] psql apply failed: %O', e)
    return false
  }
}

export async function getProjectTenantDatabaseUrl({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<string | null> {
  const gotrueId = getGotrueUserId(claims)
  const rows = await executeQuery<{
    connection_string: string | null
    connection_string_enc: string | null
  }>({
    query: `
      select p.connection_string, p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1
        and m.gotrue_id = $2
        and m.role in ('owner', 'admin', 'developer')
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (rows.error) throw rows.error
  const row = rows.data?.[0]
  if (!row) return null
  const enc = row.connection_string_enc?.trim()
  if (enc) return decryptString(enc)
  return row.connection_string?.trim() || null
}

type TableRef = { schema: string; table: string }

async function listUserTables(client: Client, schemas: string[]): Promise<TableRef[]> {
  const { rows } = await client.query<{ schema: string; table: string }>(
    `
      select table_schema as schema, table_name as table
      from information_schema.tables
      where table_schema = any($1::text[])
        and table_type = 'BASE TABLE'
      order by table_schema, table_name
    `,
    [schemas]
  )
  return rows
}

async function tableExists(client: Client, schema: string, table: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = $1 and table_name = $2 and table_type = 'BASE TABLE'
      ) as exists
    `,
    [schema, table]
  )
  return Boolean(rows[0]?.exists)
}

async function copySchemaViaSql({
  parentUrl,
  branchUrl,
  schemas,
  includeData,
}: {
  parentUrl: string
  branchUrl: string
  schemas: string[]
  includeData: boolean
}): Promise<boolean> {
  const parent = new Client({ connectionString: parentUrl })
  const branch = new Client({ connectionString: branchUrl })
  await parent.connect()
  await branch.connect()
  try {
    for (const schema of schemas) {
      if (SYSTEM_SCHEMAS.has(schema)) continue
      await branch.query(`create schema if not exists ${quoteIdent(schema)}`)
    }

    const tables = await listUserTables(parent, schemas)
    for (const { schema, table } of tables) {
      if (SYSTEM_SCHEMAS.has(schema)) continue

      const { rows: cols } = await parent.query<{
        column_name: string
        data_type: string
        udt_name: string
        is_nullable: string
        column_default: string | null
        character_maximum_length: number | null
      }>(
        `
          select
            column_name,
            data_type,
            udt_name,
            is_nullable,
            column_default,
            character_maximum_length
          from information_schema.columns
          where table_schema = $1 and table_name = $2
          order by ordinal_position
        `,
        [schema, table]
      )
      if (!cols.length) continue

      const colDefs = cols
        .map((c) => {
          let type = c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type
          if (c.character_maximum_length != null && type === 'character varying') {
            type = `varchar(${c.character_maximum_length})`
          }
          const nullable = c.is_nullable === 'YES' ? '' : ' not null'
          const defaultVal = c.column_default ? ` default ${c.column_default}` : ''
          return `${quoteIdent(c.column_name)} ${type}${nullable}${defaultVal}`
        })
        .join(', ')

      const qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`
      await branch.query(`create table if not exists ${qualified} (${colDefs})`)

      if (includeData) {
        const { rows: data } = await parent.query(`select * from ${qualified}`)
        if (data.length > 0) {
          const colNames = Object.keys(data[0]!)
          const placeholders = colNames.map((_, i) => `$${i + 1}`).join(', ')
          const insertSql = `insert into ${qualified} (${colNames.map(quoteIdent).join(', ')}) values (${placeholders}) on conflict do nothing`
          for (const row of data) {
            await branch.query(
              insertSql,
              colNames.map((c) => (row as Record<string, unknown>)[c])
            )
          }
        }
      }
    }
    return true
  } finally {
    await parent.end()
    await branch.end()
  }
}

/**
 * Copy parent tenant schema (and optionally row data) into a branch tenant database.
 */
export async function copyParentTenantIntoBranch({
  parentUrl,
  branchUrl,
  schemas,
  includeData,
}: {
  parentUrl: string
  branchUrl: string
  schemas: string[]
  includeData: boolean
}): Promise<{ ok: boolean; method: 'pg_dump' | 'sql' | 'skipped' }> {
  const parentParts = parsePostgresConnectionUrl(parentUrl)
  const branchParts = parsePostgresConnectionUrl(branchUrl)
  const schemaArgs = schemas.flatMap((s) => ['--schema', s])

  const schemaDump = await runPgDump(parentParts, [
    '--schema-only',
    '--no-owner',
    '--no-acl',
    '--if-exists',
    ...schemaArgs,
  ])

  if (schemaDump) {
    const applied = await runPsql(branchParts, schemaDump)
    if (applied) {
      if (includeData) {
        const dataDump = await runPgDump(parentParts, [
          '--data-only',
          '--no-owner',
          '--no-acl',
          '--inserts',
          '--disable-triggers',
          ...schemaArgs,
        ])
        if (dataDump) await runPsql(branchParts, dataDump)
      }
      return { ok: true, method: 'pg_dump' }
    }
  }

  try {
    const ok = await copySchemaViaSql({ parentUrl, branchUrl, schemas, includeData })
    return { ok, method: ok ? 'sql' : 'skipped' }
  } catch (e) {
    console.warn('[branch-tenant-db] SQL schema copy failed: %O', e)
    return { ok: false, method: 'skipped' }
  }
}

async function dumpSingleTableSchema(parts: PgConnParts, schema: string, table: string) {
  return runPgDump(parts, [
    '--schema-only',
    '--no-owner',
    '--no-acl',
    '--table',
    `${schema}.${table}`,
  ])
}

async function listAddedColumns({
  parent,
  branch,
  schemas,
}: {
  parent: Client
  branch: Client
  schemas: string[]
}): Promise<string[]> {
  const { rows } = await branch.query<{
    table_schema: string
    table_name: string
    column_name: string
    data_type: string
    udt_name: string
    is_nullable: string
    column_default: string | null
    character_maximum_length: number | null
  }>(
    `
      select
        b.table_schema,
        b.table_name,
        b.column_name,
        b.data_type,
        b.udt_name,
        b.is_nullable,
        b.column_default,
        b.character_maximum_length
      from information_schema.columns b
      where b.table_schema = any($1::text[])
      order by b.table_schema, b.table_name, b.ordinal_position
    `,
    [schemas]
  )

  const statements: string[] = []
  for (const col of rows) {
    if (SYSTEM_SCHEMAS.has(col.table_schema)) continue
    const parentHas = await parent.query<{ exists: boolean }>(
      `
        select exists (
          select 1 from information_schema.columns
          where table_schema = $1 and table_name = $2 and column_name = $3
        ) as exists
      `,
      [col.table_schema, col.table_name, col.column_name]
    )
    if (parentHas.rows[0]?.exists) continue

    const parentHasTable = await tableExists(parent, col.table_schema, col.table_name)
    if (!parentHasTable) continue

    let type = col.data_type === 'USER-DEFINED' ? col.udt_name : col.data_type
    if (col.character_maximum_length != null && type === 'character varying') {
      type = `varchar(${col.character_maximum_length})`
    }
    const nullable = col.is_nullable === 'YES' ? '' : ' not null'
    const defaultVal = col.column_default ? ` default ${col.column_default}` : ''
    const qualified = `${quoteIdent(col.table_schema)}.${quoteIdent(col.table_name)}`
    statements.push(
      `alter table ${qualified} add column if not exists ${quoteIdent(col.column_name)} ${type}${nullable}${defaultVal};`
    )
  }
  return statements
}

/**
 * SQL statements to transform parent schema toward branch (branch ahead of parent).
 * Returns empty string when diff cannot be computed or there are no changes.
 */
export async function computeBranchSchemaDiffSql({
  parentUrl,
  branchUrl,
  schemas,
}: {
  parentUrl: string
  branchUrl: string
  schemas: string[]
}): Promise<string> {
  const parent = new Client({ connectionString: parentUrl })
  const branch = new Client({ connectionString: branchUrl })
  await parent.connect()
  await branch.connect()

  try {
    const branchTables = await listUserTables(branch, schemas)
    const parentTables = await listUserTables(parent, schemas)
    const parentTableSet = new Set(parentTables.map((t) => `${t.schema}.${t.table}`))

    const statements: string[] = []

    for (const { schema, table } of branchTables) {
      if (SYSTEM_SCHEMAS.has(schema)) continue
      const key = `${schema}.${table}`
      if (parentTableSet.has(key)) continue

      const branchParts = parsePostgresConnectionUrl(branchUrl)
      const ddl = await dumpSingleTableSchema(branchParts, schema, table)
      if (ddl?.trim()) {
        statements.push(`-- table ${key}\n${ddl.trim()}`)
      }
    }

    statements.push(...(await listAddedColumns({ parent, branch, schemas })))

    return statements.filter(Boolean).join('\n\n')
  } finally {
    await parent.end()
    await branch.end()
  }
}

export async function resetBranchDatabaseFromParent({
  parentUrl,
  branchUrl,
  schemas,
}: {
  parentUrl: string
  branchUrl: string
  schemas: string[]
}): Promise<void> {
  const branch = new Client({ connectionString: branchUrl })
  await branch.connect()
  try {
    for (const schema of schemas) {
      if (SYSTEM_SCHEMAS.has(schema)) continue
      const tables = await listUserTables(branch, [schema])
      for (const { schema: s, table } of tables) {
        await branch.query(`drop table if exists ${quoteIdent(s)}.${quoteIdent(table)} cascade`)
      }
    }
  } finally {
    await branch.end()
  }

  const copy = await copyParentTenantIntoBranch({
    parentUrl,
    branchUrl,
    schemas,
    includeData: false,
  })
  if (!copy.ok) {
    throw new Error('Failed to reset branch database from parent')
  }
}
