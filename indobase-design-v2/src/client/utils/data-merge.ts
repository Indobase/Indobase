/**
 * Client-side business-data merge for Indobase Design.
 *
 * Templates and AI drafts may include placeholders like {{product_name}} or {{price}}.
 * Paste JSON / CSV (header row) and apply to the active canvas text objects.
 *
 * Format:
 *   JSON object: { "product_name": "Paneer Tikka", "price": "₹220" }
 *   CSV: product_name,price\nPaneer Tikka,₹220
 *   (first data row is used for merge)
 */

export function replaceTokens(
  text: string,
  data: Record<string, string | number | null | undefined>
): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key: string) => {
    const val = data[key]
    if (val === undefined || val === null) return `{{${key}}}`
    return String(val)
  })
}

export function extractPlaceholderKeysFromCanvasJson(canvasJson: string): string[] {
  try {
    const canvas = JSON.parse(canvasJson) as { objects?: unknown[] }
    return extractPlaceholderKeys(canvas)
  } catch {
    return []
  }
}

export function extractPlaceholderKeys(canvas: { objects?: unknown[] }): string[] {
  const keys = new Set<string>()
  const objects = Array.isArray(canvas.objects) ? canvas.objects : []
  for (const raw of objects) {
    if (!raw || typeof raw !== 'object') continue
    const text = (raw as { text?: unknown }).text
    if (typeof text !== 'string') continue
    for (const m of text.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
      keys.add(m[1])
    }
  }
  return Array.from(keys).sort()
}

export function mergeCanvasJson(
  canvasJson: string,
  data: Record<string, string | number | null | undefined>
): string {
  const canvas = JSON.parse(canvasJson) as { objects?: unknown[]; [k: string]: unknown }
  const objects = Array.isArray(canvas.objects) ? canvas.objects : []
  canvas.objects = objects.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    const obj = { ...(raw as Record<string, unknown>) }
    if (typeof obj.text === 'string') {
      obj.text = replaceTokens(obj.text, data)
    }
    return obj
  })
  return JSON.stringify(canvas)
}

/** Parse JSON object or simple CSV (header + first row). */
export function parseMergeData(raw: string): Record<string, string> {
  const text = raw.trim()
  if (!text) return {}

  if (text.startsWith('{')) {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v === null || v === undefined) continue
      if (typeof v === 'object') continue
      out[k] = String(v)
    }
    return out
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    throw new Error('CSV needs a header row and at least one data row')
  }
  const headers = splitCsvLine(lines[0])
  const values = splitCsvLine(lines[1])
  const out: Record<string, string> = {}
  headers.forEach((h, i) => {
    const key = h.trim()
    if (!key) return
    out[key] = (values[i] ?? '').trim()
  })
  return out
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}
