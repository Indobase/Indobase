import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'
import { enforcePublicAuthRateLimits } from 'lib/api/rate-limit'
import { resolveDirectGotrueUrl } from 'lib/gotrue-direct-url'

/**
 * Proxies GoTrue `POST /resend` for signup confirmation emails.
 * Prefer direct GoTrue (same pattern as verify-otp) so confirmation mail is not
 * blocked by Kong anon-key mismatches. Do not multi-host retry — that duplicates mail.
 */
export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      return res
        .status(405)
        .json({ error: { message: `Method ${method} Not Allowed` }, data: null })
  }
}

function gotrueResendUrl(base: string): string {
  const normalized = base.replace(/\/$/, '')
  return normalized.endsWith('/auth/v1') ? `${normalized}/resend` : `${normalized}/resend`
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  let payload: Record<string, unknown> = req.body ?? {}
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      payload = {}
    }
  }

  const email = typeof payload.email === 'string' ? payload.email.trim() : ''
  if (!email) {
    return res.status(400).json({ message: 'Email is required' })
  }

  const allowed = enforcePublicAuthRateLimits(req, res, {
    keyPrefix: 'platform-resend-confirmation',
    ipMax: 5,
    ipWindowMs: 60_000,
    email,
  })
  if (!allowed) return

  const redirectTo = typeof payload.redirectTo === 'string' ? payload.redirectTo : undefined
  const hcaptchaToken =
    typeof payload.hcaptchaToken === 'string' ? payload.hcaptchaToken : undefined

  const anonKeyRaw =
    process.env.SUPABASE_ANON_KEY ||
    process.env.ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!anonKeyRaw) {
    return res.status(500).json({
      message:
        'Missing anon key for resend. Set SUPABASE_ANON_KEY or ANON_KEY on the Studio server.',
    })
  }

  const projectUrlBase =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''

  // Prefer the same GoTrue path as signup (Kong) so Swarm Studio does not depend on
  // compose DNS for indobase-auth. Single host only — never multi-retry (duplicate mail).
  const gotrueBase =
    process.env.GOTRUE_URL ||
    process.env.KONG_INTERNAL_GOTRUE_URL ||
    (projectUrlBase ? `${projectUrlBase.replace(/\/$/, '')}/auth/v1` : '') ||
    resolveDirectGotrueUrl()

  const resendUrl = new URL(gotrueResendUrl(gotrueBase))
  if (redirectTo) {
    resendUrl.searchParams.set('redirect_to', redirectTo)
  }

  const body: Record<string, unknown> = {
    email,
    type: 'signup',
  }
  if (hcaptchaToken) {
    body.captcha_token = hcaptchaToken
  }

  const timeoutMs = parseInt(process.env.GOTRUE_RESEND_TIMEOUT_MS || '30000', 10)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(resendUrl.toString(), {
      method: 'POST',
      headers: {
        apikey: anonKeyRaw,
        Authorization: `Bearer ${anonKeyRaw}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await response.text()
    let json: Record<string, unknown> | null = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }

    if (!response.ok) {
      const message =
        (typeof json?.msg === 'string' && json.msg) ||
        (typeof json?.message === 'string' && json.message) ||
        (typeof json?.error_description === 'string' && json.error_description) ||
        text ||
        'Failed to resend confirmation email'

      // Soft-succeed on timeout-shaped upstream errors so the UI does not prompt another click
      // (GoTrue may already have queued the message — same rationale as signup.ts).
      if (response.status === 504) {
        return res.status(202).json({
          message:
            'Confirmation email is processing. Check your inbox (and spam). Do not request another email yet.',
          pending_confirmation: true,
        })
      }

      return res.status(response.status).json({
        ...(json ?? {}),
        message,
      })
    }

    return res.status(response.status).json(json ?? { ok: true })
  } catch (error: unknown) {
    const aborted =
      (error instanceof Error && error.name === 'AbortError') ||
      String(error).toLowerCase().includes('abort')

    if (aborted) {
      return res.status(202).json({
        message:
          'Confirmation email is processing. Check your inbox (and spam). Do not request another email yet.',
        pending_confirmation: true,
      })
    }

    const message = error instanceof Error ? error.message : String(error)
    return res.status(502).json({
      message: 'Failed to reach GoTrue resend endpoint',
      error: message,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}
