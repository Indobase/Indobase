/**
 * Bulk create — clone a template canvas for each CSV/JSON row with merge applied.
 */
import { mergeCanvasJson, parseMergeData } from './data-merge'

export type BulkRow = Record<string, string>

export function parseBulkRows(raw: string): BulkRow[] {
  const text = raw.trim()
  if (!text) return []

  if (text.startsWith('[')) {
    const arr = JSON.parse(text) as unknown[]
    return arr
      .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
      .map((r) => {
        const out: BulkRow = {}
        for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
          if (v !== null && v !== undefined && typeof v !== 'object') out[k] = String(v)
        }
        return out
      })
  }

  if (text.startsWith('{')) {
    return [parseMergeData(text)]
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = splitCsv(lines[0])
  return lines.slice(1).map((line) => {
    const vals = splitCsv(line)
    const row: BulkRow = {}
    headers.forEach((h, i) => {
      const key = h.trim()
      if (key) row[key] = (vals[i] ?? '').trim()
    })
    return row
  })
}

function splitCsv(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(cur)
      cur = ''
    } else cur += ch
  }
  result.push(cur)
  return result
}

export function buildBulkVariants(
  templateCanvasJson: string,
  rows: BulkRow[],
  limit = 50
): Array<{ name: string; canvas_json: string }> {
  return rows.slice(0, limit).map((row, i) => ({
    name: row.name || row.product_name || row.title || `Variant ${i + 1}`,
    canvas_json: mergeCanvasJson(
      typeof templateCanvasJson === 'string'
        ? templateCanvasJson
        : JSON.stringify(templateCanvasJson),
      row
    ),
  }))
}
