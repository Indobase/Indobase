import type { EmailOtpType } from '@indobaseinc/indobase-js'

import { BASE_PATH } from 'lib/constants'

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
])

function readQueryParam(
  query: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = query[key]
  return typeof value === 'string' ? value : ''
}

/**
 * GoTrue builds {{ .ConfirmationURL }} with a `token` query param; Studio and docs
 * expect `token_hash`. Accept both.
 */
export function readAuthConfirmTokenHash(
  query: Record<string, string | string[] | undefined>
): string {
  return readQueryParam(query, 'token_hash') || readQueryParam(query, 'token')
}

export function readAuthConfirmType(
  query: Record<string, string | string[] | undefined>
): EmailOtpType | null {
  const raw = readQueryParam(query, 'type')
  return EMAIL_OTP_TYPES.has(raw as EmailOtpType) ? (raw as EmailOtpType) : null
}

/**
 * Resolve post-verify redirect from `next` or GoTrue's `redirect_to`.
 */
export function resolveAuthConfirmNextPath(
  query: Record<string, string | string[] | undefined>,
  type: EmailOtpType | null,
  origin: string
): string {
  const nextParam =
    readQueryParam(query, 'next') || readQueryParam(query, 'redirect_to')

  let nextRaw = nextParam
  if (nextRaw.includes('://')) {
    try {
      const parsed = new URL(nextRaw)
      if (parsed.origin === origin) {
        nextRaw = `${parsed.pathname}${parsed.search}${parsed.hash}`
      }
    } catch {
      // fall through to defaults below
    }
  }

  if (nextRaw && nextRaw.startsWith('/') && !nextRaw.includes('://')) {
    return nextRaw
  }

  if (type === 'recovery') {
    return `${BASE_PATH}/reset-password`
  }

  if (type === 'signup' || type === 'email' || type === 'invite') {
    return `${BASE_PATH}/organizations`
  }

  return `${BASE_PATH}/organizations`
}
