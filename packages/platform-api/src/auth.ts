import crypto from 'node:crypto'

/**
 * Validates bridge → Platform API shared secret (BUILDER_CFOS_HANDOFF_SECRET).
 */
export function verifyOsApiSecret(provided: string | undefined | null): boolean {
  if (!provided?.trim()) return false
  const expected =
    process.env.BUILDER_CFOS_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.STUDIO_HANDOFF_SECRET?.trim() ||
    ''
  if (expected.length < 32) return false
  const actual = provided.trim()
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

export function resolveOsApiSecret(): string {
  const secret =
    process.env.BUILDER_CFOS_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.STUDIO_HANDOFF_SECRET?.trim() ||
    ''
  if (secret.length < 32) {
    throw new Error(
      'BUILDER_CFOS_HANDOFF_SECRET (or BUILDER_HANDOFF_SECRET) missing or shorter than 32 chars',
    )
  }
  return secret
}
