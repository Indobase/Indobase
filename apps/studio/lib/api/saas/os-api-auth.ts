import crypto from 'node:crypto'

import type { NextApiRequest } from 'next'

import { resolveBuilderCfosHandoffSecret } from './builder-cfos-launch'

export function readOsApiSecret(req: NextApiRequest): string | null {
  const raw = req.headers['x-indobase-os-secret']
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim()
  return null
}

export function requireOsApiSecret(req: NextApiRequest): boolean {
  const provided = readOsApiSecret(req)
  if (!provided) return false
  try {
    const expected = resolveBuilderCfosHandoffSecret()
    if (provided.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  } catch {
    return false
  }
}
