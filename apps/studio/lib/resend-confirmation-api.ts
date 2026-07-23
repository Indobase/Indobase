type ResendConfirmationResult = {
  error: Error | null
  pending?: boolean
}

export async function resendSignupConfirmation(options: {
  email: string
  redirectTo?: string
  hcaptchaToken?: string | null
}): Promise<ResendConfirmationResult> {
  const response = await fetch('/api/platform/resend-confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: options.email,
      redirectTo: options.redirectTo,
      hcaptchaToken: options.hcaptchaToken ?? undefined,
    }),
  })

  const json = await response.json().catch(() => null)
  const message =
    (typeof json?.message === 'string' && json.message) ||
    (typeof json?.msg === 'string' && json.msg) ||
    'Failed to resend confirmation email'

  if (response.status === 202 || json?.pending_confirmation === true) {
    return { error: null, pending: true }
  }

  if (!response.ok) {
    return { error: new Error(message) }
  }

  return { error: null }
}
