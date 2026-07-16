import { auth } from 'lib/gotrue'
import type { EmailOtpType, Session, User } from '@indobaseinc/indobase-js'

type VerifyOtpPayload =
  | { type: EmailOtpType; token_hash: string }
  | { type: EmailOtpType; email: string; token: string }

type VerifyOtpResult = {
  user: User | null
  session: Session | null
  error: Error | null
}

export async function verifyOtpViaPlatform(payload: VerifyOtpPayload): Promise<VerifyOtpResult> {
  const response = await fetch('/api/platform/recovery/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const json = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      (typeof json?.message === 'string' && json.message) ||
      (typeof json?.msg === 'string' && json.msg) ||
      'Verification failed'
    return { user: null, session: null, error: new Error(message) }
  }

  const access_token = typeof json?.access_token === 'string' ? json.access_token : null
  const refresh_token = typeof json?.refresh_token === 'string' ? json.refresh_token : null

  if (!access_token || !refresh_token) {
    return { user: null, session: null, error: new Error('Verification did not return a session') }
  }

  const { data, error } = await auth.setSession({ access_token, refresh_token })
  if (error) {
    return { user: null, session: null, error: new Error(error.message) }
  }

  return {
    user: data.user ?? (json.user as User | null) ?? null,
    session: data.session,
    error: null,
  }
}

export async function completePasswordResetViaPlatform(
  password: string,
  accessToken: string
): Promise<{ error: Error | null }> {
  const response = await fetch('/api/platform/recovery/complete-password-reset', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  })

  const json = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      (typeof json?.message === 'string' && json.message) ||
      (typeof json?.msg === 'string' && json.msg) ||
      'Failed to save password'
    return { error: new Error(message) }
  }

  return { error: null }
}
