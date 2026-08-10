/**
 * Normalize Platform / GoTrue / rate-limit error bodies into user-facing copy.
 * Never surface raw 500 stack traces or opaque upstream SMTP internals.
 */

export type NormalizedAuthError = {
  message: string
  code?: string
  retryAfterSeconds?: number
  status: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** Pull message (+ nested error.code) from Platform API JSON. */
export function extractPlatformErrorMessage(
  json: Record<string, unknown> | null | undefined,
  fallback: string,
): { message: string; code?: string; retryAfterSeconds?: number } {
  if (!json) return { message: fallback }

  const topMessage = typeof json.message === 'string' ? json.message.trim() : ''
  const topCode = typeof json.code === 'string' ? json.code : undefined
  const nested = asRecord(json.error)
  const nestedMessage = nested && typeof nested.message === 'string' ? nested.message.trim() : ''
  const nestedCode = nested && typeof nested.code === 'string' ? nested.code : undefined
  const retryRaw = nested?.retryAfterSeconds ?? json.retryAfterSeconds
  const retryAfterSeconds =
    typeof retryRaw === 'number' && Number.isFinite(retryRaw) && retryRaw > 0
      ? Math.ceil(retryRaw)
      : undefined

  const code = nestedCode || topCode
  if (code === 'rate_limited') {
    return {
      code,
      retryAfterSeconds,
      message: retryAfterSeconds
        ? `Too many attempts. Please wait ${retryAfterSeconds}s and try again.`
        : nestedMessage || topMessage || 'Too many attempts. Please wait a moment and try again.',
    }
  }

  const message = topMessage || nestedMessage
  if (message) return { message, code, retryAfterSeconds }
  return { message: fallback, code, retryAfterSeconds }
}

/** Map HTTP status + platform body to a safe bridge response for /auth/*. */
export function normalizeAuthRouteError(
  status: number,
  json: Record<string, unknown> | null | undefined,
  kind: 'start' | 'verify',
): NormalizedAuthError {
  const fallback =
    kind === 'start'
      ? "Couldn't send the verification email. Please try again shortly."
      : 'Invalid or expired verification code. Request a new code and try again.'

  const extracted = extractPlatformErrorMessage(json, fallback)
  let message = extracted.message
  let outStatus = status >= 400 ? status : 502

  // Opaque / infra failures → friendly 502 (never leak SMTP/internal wording).
  if (
    outStatus >= 500 ||
    /internal|smtp|mailer|dial|econnrefused|connection refused|etimedout|fetch failed/i.test(
      message,
    )
  ) {
    outStatus = outStatus >= 500 ? (outStatus === 504 ? 504 : 502) : outStatus
    if (kind === 'start') {
      message =
        "Couldn't send the verification email right now. Please try again in a minute."
    } else if (!/invalid|expired|code/i.test(message)) {
      message = 'Verification failed. Request a new code and try again.'
    }
  }

  if (extracted.code === 'rate_limited') {
    outStatus = 429
  }

  return {
    message,
    code: extracted.code,
    retryAfterSeconds: extracted.retryAfterSeconds,
    status: outStatus,
  }
}

export function authErrorJsonBody(err: NormalizedAuthError): Record<string, unknown> {
  const body: Record<string, unknown> = { message: err.message, ok: false }
  if (err.code) body.code = err.code
  if (err.retryAfterSeconds) body.retryAfterSeconds = err.retryAfterSeconds
  return body
}
