/**
 * Seeds the built-in template library. Runs at boot, idempotent on `slug`.
 *
 * Upsert rather than insert-if-empty: shipping an improved template should update the existing row
 * on redeploy, not silently keep the old one. User-saved templates (gotrue_id not null) are never
 * touched — the WHERE clause only matches the global library.
 *
 * After upsert, prune global library rows whose slug is no longer in the seed set so catalog
 * expansions don't leave obsolete variants around.
 *
 * Batched concurrency keeps ~2500 upserts fast without saturating the pool.
 */
import { getPool } from './db.js'
import { expandTemplateLibrary } from './templates-extra.js'

const BATCH = 40

export async function seedTemplates(): Promise<number> {
  const pool = getPool()
  const templates = expandTemplateLibrary()
  let count = 0

  for (let i = 0; i < templates.length; i += BATCH) {
    const slice = templates.slice(i, i + BATCH)
    await Promise.all(
      slice.map((t) =>
        pool.query(
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
      )
    )
    count += slice.length
  }

  const keep = templates.map((t) => t.slug)
  await pool.query(
    `delete from design.templates
     where gotrue_id is null
       and not (slug = any($1::text[]))`,
    [keep]
  )

  return count
}
