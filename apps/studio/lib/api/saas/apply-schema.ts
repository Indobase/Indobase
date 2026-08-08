/**
 * Generic tenant-DB schema apply for any web app (SaaS, booking, blog, dashboard…).
 * Declarative tables only — no arbitrary SQL from agents.
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getDatabaseOperations } from './mcp'
import { ensureOsCapability } from './os-ensurer'
import type { Claims } from './platform'

type ClaimsLike = JwtPayload & Record<string, unknown>

const ALLOWED_TYPES = new Set([
  'text',
  'uuid',
  'integer',
  'bigint',
  'boolean',
  'timestamptz',
  'numeric',
  'jsonb',
])

export type SchemaColumnInput = {
  name: string
  type: string
  primary_key?: boolean | null
  required?: boolean | null
  unique?: boolean | null
  default?: string | null
}

export type SchemaTableInput = {
  name: string
  columns: SchemaColumnInput[]
  /** Grant SELECT to anon (public read) */
  anon_select?: boolean | null
  /** Grant SELECT/INSERT/UPDATE/DELETE to authenticated */
  authenticated_write?: boolean | null
}

export type ApplySchemaResult = {
  ok: boolean
  message: string
  code?: string
  tables?: string[]
  statements_run?: number
  admin_html?: string
}

function isSafeIdent(name: string): boolean {
  return /^[a-z][a-z0-9_]{0,62}$/.test(name)
}

function normalizeDefault(raw: string | null | undefined, type: string): string | null {
  if (!raw) return null
  const d = raw.trim()
  if (d === 'gen_random_uuid()' && type === 'uuid') return 'gen_random_uuid()'
  if (d === 'now()' && type === 'timestamptz') return 'now()'
  if (d === 'true' || d === 'false') return d
  if (/^-?\d+(\.\d+)?$/.test(d)) return d
  if (/^'[^']*'$/.test(d)) return d
  return null
}

export function buildCreateTableSql(table: SchemaTableInput): { ok: true; sql: string } | { ok: false; message: string } {
  const tableName = (table.name || '').trim().toLowerCase()
  if (!isSafeIdent(tableName)) {
    return { ok: false, message: `Invalid table name: ${table.name}` }
  }
  if (!Array.isArray(table.columns) || table.columns.length === 0) {
    return { ok: false, message: `Table ${tableName} needs at least one column` }
  }

  const cols: string[] = []
  let hasPk = false
  for (const col of table.columns) {
    const name = (col.name || '').trim().toLowerCase()
    const type = (col.type || '').trim().toLowerCase()
    if (!isSafeIdent(name)) {
      return { ok: false, message: `Invalid column name: ${col.name}` }
    }
    if (!ALLOWED_TYPES.has(type)) {
      return {
        ok: false,
        message: `Unsupported type "${col.type}" on ${tableName}.${name}. Allowed: ${[...ALLOWED_TYPES].join(', ')}`,
      }
    }
    let line = `${name} ${type}`
    if (col.primary_key) {
      line += ' primary key'
      hasPk = true
    }
    if (col.required && !col.primary_key) line += ' not null'
    if (col.unique && !col.primary_key) line += ' unique'
    const def = normalizeDefault(col.default, type)
    if (col.default && !def) {
      return {
        ok: false,
        message: `Unsafe default on ${tableName}.${name}. Use gen_random_uuid(), now(), true/false, number, or 'string'`,
      }
    }
    if (def) line += ` default ${def}`
    cols.push(line)
  }

  if (!hasPk) {
    cols.unshift('id uuid primary key default gen_random_uuid()')
  }

  return {
    ok: true,
    sql: `create table if not exists public.${tableName} (${cols.join(', ')})`,
  }
}

export function buildShopAdminHtmlStub(opts: {
  brand?: string
  tables: string[]
}): string {
  const brand = (opts.brand || 'App').replace(/[<>&"]/g, '')
  const tablesJson = JSON.stringify(opts.tables)
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand} — Data</title>
<style>
body{margin:0;font:14px/1.45 system-ui,sans-serif;background:#fafafa;color:#111}
header{padding:20px 24px;background:#fff;border-bottom:1px solid #e5e5e5}
main{max-width:800px;margin:0 auto;padding:24px}
li{margin:6px 0}
</style></head>
<body>
<header><h1 style="margin:0;font-size:18px">${brand} — Data model</h1>
<p style="margin:6px 0 0;color:#666">Tables applied via Indobase applySchema. Wire your UI to the project REST API.</p></header>
<main><h2>Tables</h2><ul id="t"></ul></main>
<script>document.getElementById('t').innerHTML=(${tablesJson}).map(t=>'<li><code>public.'+t+'</code></li>').join('')||'<li>None</li>'</script>
</body></html>`
}

export async function applyAppSchema({
  claims,
  ref,
  tables,
  brand,
}: {
  claims: ClaimsLike
  ref: string
  tables: SchemaTableInput[]
  brand?: string | null
}): Promise<ApplySchemaResult> {
  if (!Array.isArray(tables) || tables.length === 0) {
    return { ok: false, code: 'tables_required', message: 'tables[] required' }
  }
  if (tables.length > 40) {
    return { ok: false, code: 'too_many_tables', message: 'Max 40 tables per applySchema call' }
  }

  const ensured = await ensureOsCapability({
    claims: claims as Claims,
    workspaceRef: ref,
    capability: 'businessData',
  })
  if (!ensured.ok && ensured.status !== 'enabled') {
    return {
      ok: false,
      code: 'database_required',
      message:
        ensured.message ||
        'Customer database not ready — call ensureDatabase first, then retry applySchema',
    }
  }

  const db = getDatabaseOperations({ claims, projectRef: ref })
  const applied: string[] = []
  let statements = 0

  for (const table of tables) {
    const built = buildCreateTableSql(table)
    if (!built.ok) {
      return { ok: false, code: 'invalid_schema', message: built.message }
    }
    try {
      await db.executeSql(ref, { query: built.sql })
      statements += 1
      const tableName = table.name.trim().toLowerCase()
      applied.push(tableName)

      if (table.anon_select) {
        await db.executeSql(ref, {
          query: `grant select on public.${tableName} to anon, authenticated`,
        })
        statements += 1
      }
      if (table.authenticated_write !== false) {
        await db.executeSql(ref, {
          query: `grant select, insert, update, delete on public.${tableName} to authenticated, service_role`,
        })
        statements += 1
      }
    } catch (err) {
      return {
        ok: false,
        code: 'schema_failed',
        message: err instanceof Error ? err.message : `Failed creating table ${table.name}`,
        tables: applied,
        statements_run: statements,
      }
    }
  }

  return {
    ok: true,
    message: `Schema applied — ${applied.length} table(s). Wire the app to project REST/Auth; publish admin_html if useful.`,
    tables: applied,
    statements_run: statements,
    admin_html: buildShopAdminHtmlStub({ brand: brand || undefined, tables: applied }),
  }
}

export const __applySchemaTest = {
  buildCreateTableSql,
  isSafeIdent,
  ALLOWED_TYPES,
}
