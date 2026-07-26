/** Normalize Fabric canvas documents from API (jsonb → object) or string payloads. */
export function parseCanvasJson(
  raw: string | Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (raw == null) return { version: '6.0.0', objects: [] }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '{}') return { version: '6.0.0', objects: [] }
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  return { version: '6.0.0', objects: [] }
}

export function canvasJsonKey(raw: string | Record<string, unknown> | null | undefined): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}
