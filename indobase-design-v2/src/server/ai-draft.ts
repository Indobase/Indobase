/**
 * Indobase Design — AI layout draft helpers.
 *
 * Generation itself is Studio-owned (OpenRouter). This module mints a short-lived
 * design-api JWT (same DESIGN_HANDOFF_SECRET as SSO) and proxies the request so the
 * Design SPA never holds the OpenRouter key.
 */
import { createHmac } from 'node:crypto'

import type { Session } from './auth.js'

const DESIGN_API_AUD = 'indobase-design-api'
const DESIGN_API_TTL_SECONDS = 5 * 60

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function mintDesignApiToken(session: Session, secret: string): string {
  const now = Math.floor(Date.now() / 1000)
  const body = {
    aud: DESIGN_API_AUD,
    sub: session.gotrueId,
    email: session.email,
    project_ref: session.projectRef,
    organization_slug: session.orgSlug || 'unknown',
    role: session.role,
    iss: 'indobase-design',
    iat: now,
    exp: now + DESIGN_API_TTL_SECONDS,
  }
  const headerB64 = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = b64urlEncode(JSON.stringify(body))
  const data = `${headerB64}.${payloadB64}`
  const sig = b64urlEncode(createHmac('sha256', secret).update(data).digest())
  return `${data}.${sig}`
}

export function resolveStudioApiBase(): string {
  const internal = (process.env.STUDIO_INTERNAL_URL || '').trim().replace(/\/+$/, '')
  if (internal) return internal
  return (process.env.STUDIO_URL || 'https://studio.indobase.in').replace(/\/+$/, '')
}

export type AiDraftResult = {
  name: string
  width: number
  height: number
  canvas: { version: string; background: string; objects: Record<string, unknown>[] }
  model?: string
  quota?: unknown
}

export async function proxyAiDraft(opts: {
  session: Session
  secret: string
  prompt: string
  width?: number
  height?: number
  category?: string
}): Promise<AiDraftResult> {
  const token = mintDesignApiToken(opts.session, opts.secret)
  const base = resolveStudioApiBase()
  const ref = encodeURIComponent(opts.session.projectRef)
  const url = `${base}/api/platform/projects/${ref}/design/generate`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      width: opts.width,
      height: opts.height,
      category: opts.category,
    }),
  })

  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    json = { message: text.slice(0, 240) }
  }

  if (!res.ok) {
    const message =
      (typeof json.message === 'string' && json.message) ||
      (typeof json.error === 'string' && json.error) ||
      `Studio AI draft failed (${res.status})`
    throw Object.assign(new Error(message), {
      status: res.status >= 400 && res.status < 600 ? res.status : 502,
      body: json,
    })
  }

  return json as unknown as AiDraftResult
}

/** Client-side / server-side merge of {{placeholders}} into Fabric JSON. */
export function mergePlaceholders(
  canvas: { objects?: unknown[]; [k: string]: unknown },
  data: Record<string, string | number | null | undefined>
): typeof canvas {
  const objects = Array.isArray(canvas.objects) ? canvas.objects : []
  const nextObjects = objects.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    const obj = { ...(raw as Record<string, unknown>) }
    if (typeof obj.text === 'string') {
      obj.text = replaceTokens(obj.text, data)
    }
    return obj
  })
  return { ...canvas, objects: nextObjects }
}

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
