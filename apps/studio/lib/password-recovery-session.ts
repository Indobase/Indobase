import { auth } from 'lib/gotrue'

const PASSWORD_RECOVERY_SESSION_KEY = 'indobase.dashboard.auth.password-recovery'

export function markPasswordRecoverySession() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PASSWORD_RECOVERY_SESSION_KEY, String(Date.now()))
  } catch {
    // Safari private mode / blocked storage
  }
}

export function clearPasswordRecoverySession() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_SESSION_KEY)
  } catch {
    // ignore
  }
}

export function hasPasswordRecoverySession() {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(PASSWORD_RECOVERY_SESSION_KEY) !== null
  } catch {
    return false
  }
}

async function validateAccessTokenViaPlatform(accessToken: string): Promise<{
  ok: boolean
  message?: string
}> {
  const response = await fetch('/api/platform/recovery/session-user', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (response.ok) {
    return { ok: true }
  }

  const json = await response.json().catch(() => null)
  const message =
    (typeof json?.message === 'string' && json.message) ||
    (typeof json?.msg === 'string' && json.msg) ||
    'Your password reset session has expired.'

  return { ok: false, message }
}

/**
 * Confirms a recovery session exists in this tab and the access token is valid
 * on control-plane GoTrue (via Studio server proxy, not public Kong).
 */
export async function ensureActiveRecoverySession(options?: {
  allowInlineRecovery?: boolean
}): Promise<{ ok: boolean; message?: string }> {
  const allowInlineRecovery = options?.allowInlineRecovery ?? false

  if (!allowInlineRecovery && !hasPasswordRecoverySession()) {
    return {
      ok: false,
      message: 'Please open the password reset link from your email or enter your reset code.',
    }
  }

  const {
    data: { session },
    error: sessionError,
  } = await auth.getSession()

  if (sessionError) {
    return { ok: false, message: sessionError.message }
  }

  if (!session?.access_token) {
    return { ok: false, message: 'Your password reset session has expired.' }
  }

  return validateAccessTokenViaPlatform(session.access_token)
}
