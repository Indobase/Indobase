import crypto from 'node:crypto'

import type { JwtPayload } from '@indobaseinc/indobase-js'
import { z } from 'zod'

import { resolveBuilderHandoffSecret } from './builder-launch'

export const builderMcpTokenSchema = z.object({
  aud: z.literal('indobase-builder-mcp'),
  email: z.string().email(),
  exp: z.number(),
  iat: z.number(),
  iss: z.string().url(),
  organization_slug: z.string().min(1),
  project_ref: z.string().min(1),
  studio_url: z.string().url(),
  sub: z.string().min(1),
})

export type BuilderMcpTokenPayload = z.infer<typeof builderMcpTokenSchema>

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function encodeBase64Url(value: Buffer | string) {
  const input = typeof value === 'string' ? Buffer.from(value) : value
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function verifyBuilderMcpToken(token: string): BuilderMcpTokenPayload {
  const secret = resolveBuilderHandoffSecret()
  const parts = token.split('.')

  if (parts.length !== 3) {
    throw new Error('Invalid Builder MCP token format')
  }

  const [headerB64, payloadB64, signatureB64] = parts
  const expectedSignature = encodeBase64Url(
    crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
  )

  const providedSignatureBuffer = Buffer.from(signatureB64)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error('Invalid Builder MCP token signature')
  }

  const header = JSON.parse(decodeBase64Url(headerB64))

  if (header.alg !== 'HS256') {
    throw new Error('Unsupported Builder MCP token algorithm')
  }

  const payload = builderMcpTokenSchema.parse(JSON.parse(decodeBase64Url(payloadB64)))

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Builder MCP token has expired')
  }

  return payload
}

export function builderMcpClaimsToJwtPayload(claims: BuilderMcpTokenPayload): JwtPayload {
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
