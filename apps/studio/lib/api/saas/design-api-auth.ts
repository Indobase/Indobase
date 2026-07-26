/**
 * Dual-auth for Design platform APIs (mirror of video-api-auth).
 * Design SPA never holds OpenRouter — Design server mints a short JWT with
 * DESIGN_HANDOFF_SECRET and calls Studio /design/generate.
 */
import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'
import { z } from 'zod'

export const DESIGN_API_AUD = 'indobase-design-api' as const

export const designApiTokenSchema = z.object({
  aud: z.literal(DESIGN_API_AUD),
  email: z.string().email(),
  exp: z.number(),
  iat: z.number(),
  iss: z.string().min(1),
  organization_slug: z.string().min(1),
  project_ref: z.string().min(1),
  role: z.string().min(1),
  sub: z.string().min(1),
})

export type DesignApiTokenPayload = z.infer<typeof designApiTokenSchema>

function resolveDesignHandoffSecret(): string {
  const secret = (
    process.env.DESIGN_HANDOFF_SECRET ||
    process.env.STUDIO_HANDOFF_SECRET ||
    ''
  ).trim()
  if (secret.length < 32) {
    throw Object.assign(new Error('DESIGN_HANDOFF_SECRET is not configured'), { status: 503 })
  }
  return secret
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function encodeBase64Url(value: Buffer | string) {
  const input = typeof value === 'string' ? Buffer.from(value) : value
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function verifyDesignApiToken(token: string): DesignApiTokenPayload {
  const secret = resolveDesignHandoffSecret()
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid Design API token format')
  }

  const [headerB64, payloadB64, signatureB64] = parts
  const expectedSignature = encodeBase64Url(
    crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  )

  const provided = Buffer.from(signatureB64)
  const expected = Buffer.from(expectedSignature)
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error('Invalid Design API token signature')
  }

  const header = JSON.parse(decodeBase64Url(headerB64))
  if (header.alg !== 'HS256') {
    throw new Error('Unsupported Design API token algorithm')
  }

  const payload = designApiTokenSchema.parse(JSON.parse(decodeBase64Url(payloadB64)))
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Design API token has expired')
  }

  return payload
}

export function designApiClaimsToJwtPayload(claims: DesignApiTokenPayload): JwtPayload {
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
