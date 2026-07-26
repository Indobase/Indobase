/**
 * Seeds the built-in template library. Runs at boot, idempotent on `slug`.
 *
 * Upsert rather than insert-if-empty: shipping an improved template should update the existing row
 * on redeploy, not silently keep the old one. User-saved templates (gotrue_id not null) are never
 * touched — the WHERE clause only matches the global library.
 */
import { getPool } from './db.js'
import { BUILTIN_TEMPLATES } from './templates.js'

export async function seedTemplates(): Promise<number> {
  const pool = getPool()
  let count = 0

  for (const t of BUILTIN_TEMPLATES) {
    await pool.query(
      `insert into design.templates
         (gotrue_id, slug, name, category, canvas_json, width, height, sort_order)
       values (null, $1, $2, $3, $4::jsonb, $5, $6, $7)
       on conflict (slug) do update set
         name        = excluded.name,
         category    = excluded.category,
         canvas_json = excluded.canvas_json,
         width       = excluded.width,
         height      = excluded.height,
         sort_order  = excluded.sort_order
       where design.templates.gotrue_id is null`,
      [t.slug, t.name, t.category, JSON.stringify(t.canvas), t.width, t.height, t.sortOrder]
    )
    count += 1
  }

  return count
}
