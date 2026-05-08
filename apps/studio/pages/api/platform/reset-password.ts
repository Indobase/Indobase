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

  const anonKeyRaw =
    process.env.SUPABASE_ANON_KEY ||
    process.env.ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabaseUrlBase =
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.INDOBASE_URL ||
    process.env.INDOBASE_PUBLIC_URL ||
    ''

  const gotrueUrlRaw =
    process.env.GOTRUE_URL ||
    process.env.NEXT_PUBLIC_GOTRUE_URL ||
    (supabaseUrlBase ? `${supabaseUrlBase.replace(/\/$/, '')}/auth/v1` : '')

  if (!anonKeyRaw) {
    return res.status(500).json({
      message:
        'Missing anon key. Set SUPABASE_ANON_KEY or ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) on the Studio server.',
    })
  }
  if (!gotrueUrlRaw) {
    return res.status(500).json({
      message:
        'Missing GoTrue URL. Set GOTRUE_URL or SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) on the Studio server.',
    })
  }

  const anonKey = anonKeyRaw
  const gotrueUrl = gotrueUrlRaw

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
    process.env.KONG_INTERNAL_GOTRUE_URL || 'http://indobase-kong:8000/auth/v1'

  const publicSupabaseUrl =
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.INDOBASE_PUBLIC_URL
  const publicGotrueUrl = publicSupabaseUrl
    ? `${publicSupabaseUrl.replace(/\/$/, '')}/auth/v1`
    : undefined

  const baseCandidates = [
    gotrueUrl,
    gotrueUrl.startsWith('https:') && process.env.ENABLE_HTTP_GOTRUE_RETRY !== 'false'
      ? gotrueUrl.replace(/^https:/, 'http:')
      : undefined,
    publicGotrueUrl,
    kongInternalGotrueBaseUrl,
  ].filter(Boolean) as string[]

  const uniqueCandidates = Array.from(new Set(baseCandidates))
  const gatewayRetryStatuses = new Set([502, 503, 504])

  let r: Response | undefined
  const causes: Array<{ baseUrl: string; cause: string }> = []

  for (const baseUrlCandidate of uniqueCandidates) {
    let recoverUrl: URL
    try {
      recoverUrl = new URL(baseUrlCandidate.replace(/\/$/, '') + '/recover')
    } catch {
      causes.push({ baseUrl: baseUrlCandidate, cause: 'invalid_base_url' })
      continue
    }
    if (typeof redirectTo === 'string' && redirectTo.length > 0) {
      recoverUrl.searchParams.set('redirect_to', redirectTo)
    }

    try {
      const attempt = await fetchRecoverWithTimeout(recoverUrl.toString())
      if (attempt.ok || !gatewayRetryStatuses.has(attempt.status)) {
        r = attempt
        break
      }
      r = attempt
      causes.push({
        baseUrl: baseUrlCandidate,
        cause: `http_${attempt.status}_retrying_next_host`,
      })
    } catch (e: any) {
      const cause = e?.cause?.code ?? e?.code ?? e?.message ?? String(e)
      causes.push({ baseUrl: baseUrlCandidate, cause })
    }
  }

  if (!r) {
    return res.status(502).json({
      message: 'Failed to reach GoTrue password recovery endpoint',
      error: {
        gotrueUrlSource: process.env.GOTRUE_URL
          ? 'GOTRUE_URL'
          : process.env.SUPABASE_URL
            ? 'SUPABASE_URL'
            : 'NEXT_PUBLIC_SUPABASE_URL',
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
