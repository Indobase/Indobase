/**
 * Local prompt-quota meter when Studio is unavailable (managed backend path).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { OsPromptQuotaResponse } from '@indobase/platform-api'

const DEFAULT_LIMIT = 500

type MeterFile = {
  version: 1
  entries: Record<string, { used: number; updatedAt: string }>
}

function meterPath(): string {
  const root =
    process.env.INDOBASE_OTP_STORE_DIR?.trim() ||
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR?.trim() ||
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  return path.join(root, 'prompt-quota-meter.json')
}

async function readMeter(): Promise<MeterFile> {
  try {
    const raw = await fs.readFile(meterPath(), 'utf8')
    const parsed = JSON.parse(raw) as MeterFile
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== 'object') {
      return { version: 1, entries: {} }
    }
    return parsed
  } catch {
    return { version: 1, entries: {} }
  }
}

async function writeMeter(meter: MeterFile): Promise<void> {
  const file = meterPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(meter, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

function limit(): number {
  const n = parseInt(process.env.INDOBASE_MANAGED_PROMPT_LIMIT || '', 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT
}

export async function managedPromptQuotaGet(input: {
  gotrueId: string
  workspaceRef: string
}): Promise<OsPromptQuotaResponse & { httpStatus: number }> {
  const key = `${input.gotrueId}:${input.workspaceRef}`
  const meter = await readMeter()
  const used = meter.entries[key]?.used || 0
  const lim = limit()
  const remaining = Math.max(0, lim - used)
  return {
    ok: true,
    quota: {
      plan: 'managed',
      used,
      remaining,
      limit: lim,
      isFree: false,
      organization_slug: 'indobase',
      upgradeUrl: '',
    },
    httpStatus: remaining > 0 ? 200 : 402,
  }
}

export async function managedPromptQuotaConsume(input: {
  gotrueId: string
  workspaceRef: string
}): Promise<OsPromptQuotaResponse & { httpStatus: number }> {
  const key = `${input.gotrueId}:${input.workspaceRef}`
  const meter = await readMeter()
  const used = (meter.entries[key]?.used || 0) + 1
  const lim = limit()
  meter.entries[key] = { used, updatedAt: new Date().toISOString() }
  await writeMeter(meter)
  const remaining = Math.max(0, lim - used)
  return {
    ok: remaining > 0,
    quota: {
      plan: 'managed',
      used,
      remaining,
      limit: lim,
      isFree: false,
      organization_slug: 'indobase',
      upgradeUrl: '',
    },
    message: remaining > 0 ? undefined : 'Agent prompt quota exceeded for this workspace',
    httpStatus: remaining > 0 ? 200 : 402,
  }
}
