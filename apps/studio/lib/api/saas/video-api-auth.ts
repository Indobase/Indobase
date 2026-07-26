import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'
import { z } from 'zod'

import { resolveVideoHandoffSecret } from './video-launch'

export const VIDEO_API_AUD = 'indobase-video-api' as const

export const videoApiTokenSchema = z.object({
  aud: z.literal(VIDEO_API_AUD),
  email: z.string().email(),
  exp: z.number(),
  iat: z.number(),
  iss: z.string().min(1),
  organization_slug: z.string().min(1),
  project_name: z.string().optional(),
  project_ref: z.string().min(1),
  role: z.string().min(1),
  studio_url: z.string().optional(),
  sub: z.string().min(1),
})

export type VideoApiTokenPayload = z.infer<typeof videoApiTokenSchema>

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function encodeBase64Url(value: Buffer | string) {
  const input = typeof value === 'string' ? Buffer.from(value) : value
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function makeVideoApiToken(
  payload: Omit<VideoApiTokenPayload, 'aud' | 'iat' | 'exp'> & { ttlSeconds?: number },
  secret = resolveVideoHandoffSecret()
): string {
  const now = Math.floor(Date.now() / 1000)
  const ttl = payload.ttlSeconds ?? 60 * 60 * 12
  const body: VideoApiTokenPayload = {
    aud: VIDEO_API_AUD,
    email: payload.email,
    exp: now + ttl,
    iat: now,
    iss: payload.iss,
    organization_slug: payload.organization_slug,
    project_name: payload.project_name,
    project_ref: payload.project_ref,
    role: payload.role,
    studio_url: payload.studio_url,
    sub: payload.sub,
  }
  const headerB64 = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadB64 = encodeBase64Url(JSON.stringify(body))
  const data = `${headerB64}.${payloadB64}`
  const signature = encodeBase64Url(crypto.createHmac('sha256', secret).update(data).digest())
  return `${data}.${signature}`
}

export function verifyVideoApiToken(token: string): VideoApiTokenPayload {
  const secret = resolveVideoHandoffSecret()
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid Video API token format')
  }

  const [headerB64, payloadB64, signatureB64] = parts
  const expectedSignature = encodeBase64Url(
    crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  )

  const provided = Buffer.from(signatureB64)
  const expected = Buffer.from(expectedSignature)
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error('Invalid Video API token signature')
  }

  const header = JSON.parse(decodeBase64Url(headerB64))
  if (header.alg !== 'HS256') {
    throw new Error('Unsupported Video API token algorithm')
  }

  const payload = videoApiTokenSchema.parse(JSON.parse(decodeBase64Url(payloadB64)))
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Video API token has expired')
  }

  return payload
}

export function videoApiClaimsToJwtPayload(claims: VideoApiTokenPayload): JwtPayload {
  return {
    sub: claims.sub,
    email: claims.email,
    role: 'authenticated',
    aud: claims.aud,
  } as JwtPayload
}

export function readBearerToken(authorization: string | undefined): string | null {
  const value = authorization?.trim()
  if (!value?.toLowerCase().startsWith('bearer ')) {
    return null
  }
  return value.replace(/^Bearer\s+/i, '').trim() || null
}

/** Allowed browser origins for Video SPA → Studio CORS. */
export function resolveVideoCorsOrigins(): string[] {
  const extras = (process.env.INDOBASE_VIDEO_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return Array.from(
    new Set([
      'https://video.indobase.in',
      'https://video.indobase.fun',
      'http://localhost:8780',
      'http://127.0.0.1:8780',
      ...extras,
    ])
  )
}

export function applyVideoCors(req: { headers: { origin?: string } }, res: {
  setHeader: (k: string, v: string) => void
  status: (n: number) => { end: () => void }
}): boolean {
  const origin = req.headers.origin
  if (origin && resolveVideoCorsOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
    res.setHeader('Vary', 'Origin')
  }
  return false
}
