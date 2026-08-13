/**
 * IdentityAdapter — OS identity boundary (ADR 0008).
 *
 * Email OTP → OS Identity → Business/Workspace → OS session.
 * CFOS/OS session code talks only to this interface. PocketBase (or Studio-era
 * OTP) is an implementation, never imported as HTTP from session/hint code.
 */

export type OsIdentity = {
  id: string
  email: string
  displayName?: string
}

export type OsBusinessRef = {
  ref: string
  name?: string
}

export type OsWorkspaceRef = {
  ref: string
  slug?: string
  name?: string
}

/**
 * Provider-free OS session after verify.
 * `dataPlane` is capability bindings only — never a product hostname or engine name.
 */
export type IdentitySession = {
  identity: OsIdentity
  business: OsBusinessRef
  workspace: OsWorkspaceRef
  provisionState?: string
  dataPlane?: {
    url: string
    anonKey: string
    extra?: Record<string, unknown>
  }
}

export type IdentityOtpStartInput = {
  name: string
  email: string
  dpdpConsent?: boolean
}

export type IdentityOtpStartResult =
  | { ok: true; email: string }
  | { ok: false; status: number; message: string }

export type IdentityOtpVerifyInput = {
  name: string
  email: string
  token: string
}

export type IdentityOtpVerifyResult =
  | { ok: true; session: IdentitySession }
  | { ok: false; status: number; message: string }

/**
 * Hidden identity engine. Implementations must not leak PocketBase / GoTrue /
 * Studio / provider names into `message`.
 */
export interface IdentityAdapter {
  startOtp(input: IdentityOtpStartInput): Promise<IdentityOtpStartResult>
  verifyOtp(input: IdentityOtpVerifyInput): Promise<IdentityOtpVerifyResult>
}

export function assertIdentityAdapter(value: IdentityAdapter): IdentityAdapter {
  if (typeof value?.startOtp !== 'function' || typeof value?.verifyOtp !== 'function') {
    throw new Error('IdentityAdapter requires startOtp and verifyOtp')
  }
  return value
}
