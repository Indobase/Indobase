/**
 * Durable JSON records under INDOBASE_LAUNCH_ROOT (same pattern as production jobs).
 * The bridge is an executor; these files survive process restart.
 */

import fs from 'node:fs'
import path from 'node:path'

export function gen3LaunchRoot(): string {
  return process.env.INDOBASE_LAUNCH_ROOT?.trim() || path.join(process.cwd(), '.indobase-launches')
}

function atomicWrite(file: string, body: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, body, 'utf8')
  fs.renameSync(tmp, file)
}

export function persistGen3Record(kind: string, id: string, value: unknown): void {
  const safeKind = kind.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'misc'
  const safeId = id.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'unknown'
  const file = path.join(gen3LaunchRoot(), 'gen3', safeKind, `${safeId}.json`)
  atomicWrite(file, `${JSON.stringify(value)}\n`)
}

export function loadGen3Record<T>(kind: string, id: string): T | null {
  const safeKind = kind.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'misc'
  const safeId = id.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'unknown'
  const file = path.join(gen3LaunchRoot(), 'gen3', safeKind, `${safeId}.json`)
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}
