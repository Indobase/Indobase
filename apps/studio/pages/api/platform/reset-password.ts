import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'

/**
 * Self-hosted / non-platform: proxy password recovery to GoTrue (`/auth/v1/recover`),
 * matching the dashboard OpenAPI path `/platform/reset-password` used by the Studio UI.
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

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  let payload: any = req.body ?? {}
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      try {
        const params = new URLSearchParams(payload)
        payload = Object.fromEntries(params.entries())
      } catch {
        payload = {}
      }
    }
  }

  const { email, hcaptchaToken, redirectTo } = payload
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'Email is required' })
  }

  const anonKeyRaw = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY
  const gotrueUrl =
    process.env.GOTRUE_URL ||
    (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1` : '')

  if (!anonKeyRaw) {
    return res.status(500).json({ message: 'Missing SUPABASE_ANON_KEY' })
  }
  if (!gotrueUrl) {
    return res.status(500).json({ message: 'Missing GOTRUE_URL (or SUPABASE_URL)' })
  }

  const anonKey = anonKeyRaw

  const body: any = { email }
  if (typeof hcaptchaToken === 'string' && hcaptchaToken.length > 0) {
    body.captcha_token = hcaptchaToken
  }

  const timeoutMs = parseInt(process.env.GOTRUE_RECOVER_TIMEOUT_MS || '8000', 10)

  async function fetchRecoverWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const kongInternalGotrueBaseUrl =
    process.env.KONG_INTERNAL_GOTRUE_URL || 'http://kong:8000/auth/v1'

  const baseCandidates = [
    gotrueUrl,
    gotrueUrl.startsWith('https:') && process.env.ENABLE_HTTP_GOTRUE_RETRY !== 'false'
      ? gotrueUrl.replace(/^https:/, 'http:')
      : undefined,
    kongInternalGotrueBaseUrl,
  ].filter(Boolean) as string[]

  const uniqueCandidates = Array.from(new Set(baseCandidates))

  let r: Response | undefined
  const causes: Array<{ baseUrl: string; cause: string }> = []

  for (const baseUrlCandidate of uniqueCandidates) {
    const recoverUrl = new URL(baseUrlCandidate.replace(/\/$/, '') + '/recover')
    if (typeof redirectTo === 'string' && redirectTo.length > 0) {
      recoverUrl.searchParams.set('redirect_to', redirectTo)
    }

    try {
      r = await fetchRecoverWithTimeout(recoverUrl.toString())
      break
    } catch (e: any) {
      const cause = e?.cause?.code ?? e?.code ?? e?.message ?? String(e)
      causes.push({ baseUrl: baseUrlCandidate, cause })
    }
  }

  if (!r) {
    return res.status(502).json({
      message: 'Failed to reach GoTrue password recovery endpoint',
      error: {
        gotrueUrlSource: process.env.GOTRUE_URL ? 'GOTRUE_URL' : 'SUPABASE_URL',
        gotrueUrl,
        tried: uniqueCandidates,
        causes,
      },
    })
  }

  const text = await r.text()
  try {
    const json = text ? JSON.parse(text) : null

    if (!r.ok) {
      const message =
        json?.message ??
        json?.msg ??
        json?.error_description ??
        json?.error?.message ??
        'Password reset request failed'

      return res.status(r.status).json({
        ...(typeof json === 'object' && json ? json : {}),
        message,
        error: json?.error ?? json,
      })
    }

    return res.status(r.status).json(json ?? {})
  } catch {
    if (!r.ok) {
      return res.status(r.status).json({ message: text || 'Password reset request failed' })
    }
    return res.status(r.status).send(text)
  }
}
