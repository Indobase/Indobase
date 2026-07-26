/**
 * Postgres access for Indobase Design.
 *
 * Replaces the upstream editor's Cloudflare D1 binding. Postgres matches the rest of the Indobase
 * fleet (Studio, Payments), so this deploys on the same VPS with the same backup/ops story rather
 * than pinning the product to Cloudflare.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (pool) return pool

  const connectionString = process.env.DESIGN_DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DESIGN_DATABASE_URL is not set')

  pool = new Pool({
    connectionString,
    // Bounded so Design cannot exhaust shared Postgres connections — same reasoning as the
    // per-tenant pool caps in the data plane.
    max: Number(process.env.DESIGN_DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  return pool
}

export async function query<T = unknown>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params)
  return res.rows as T[]
}

export async function one<T = unknown>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/** Apply schema.sql at boot. Idempotent (everything is create-if-not-exists). */
export async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url))
  // Works from both src (tsx) and dist (compiled) — schema.sql is copied next to the build output.
  let sql: string
  try {
    sql = await readFile(join(here, 'schema.sql'), 'utf8')
  } catch {
    sql = await readFile(join(here, '..', '..', 'src', 'server', 'schema.sql'), 'utf8')
  }
  await getPool().query(sql)
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
