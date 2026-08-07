/**
 * Pure OS identity input validation (no GoTrue / DB deps).
 */

export type OsIdentityStartInput = {
  name: string
  email: string
  dpdpConsent?: boolean
}

export type OsIdentityVerifyInput = {
  name: string
  email: string
  token: string
}

export class OsIdentityError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'OsIdentityError'
    this.statusCode = statusCode
  }
}

export function osIdentityErrorStatus(error: unknown): number {
  if (error instanceof OsIdentityError) return error.statusCode
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const code = Number((error as { statusCode?: number }).statusCode)
    if (code >= 400 && code < 600) return code
  }
  const message = error instanceof Error ? error.message : ''
  if (
    /required|consent|invalid|expired|missing|valid email/i.test(message) &&
    !/anon key|gotrue|timed out|abort/i.test(message)
  ) {
    return 400
  }
  return 502
}

export function validateOsIdentityStartInput(input: OsIdentityStartInput): {
  name: string
  email: string
} {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name || !email.includes('@')) {
    throw new OsIdentityError('name and valid email are required', 400)
  }
  if (input.dpdpConsent !== true) {
    throw new OsIdentityError(
      'You must accept the Privacy Policy and Terms of Service to continue (DPDP consent required).',
      400,
    )
  }
  return { name, email }
}

export function validateOsIdentityVerifyInput(input: OsIdentityVerifyInput): {
  name: string
  email: string
  token: string
} {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const token = input.token.trim()
  if (!name || !email.includes('@') || !token) {
    throw new OsIdentityError('name, email, and verification code are required', 400)
  }
  // GoTrue email OTP is typically 6 digits; reject obvious garbage early.
  if (token.length < 4 || token.length > 64) {
    throw new OsIdentityError('Invalid verification code', 400)
  }
  return { name, email, token }
}
