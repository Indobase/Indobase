import type { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'

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

function buildSignupUrl(base: string): URL {
  return new URL(`${base.replace(/\/$/, '')}/signup`)
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

  const { email, password, hcaptchaToken, redirectTo } = payload
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  // Prefer server secrets; fall back to NEXT_PUBLIC_* so Dokploy setups that only
  // inject public vars still work for signup proxying.
  const anonKeyRaw =
    process.env.SUPABASE_ANON_KEY ||
    process.env.ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabaseUrlBase =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''

  const gotrueUrlRaw =
    process.env.GOTRUE_URL ||
    (supabaseUrlBase ? `${supabaseUrlBase.replace(/\/$/, '')}/auth/v1` : '')

  if (!anonKeyRaw) {
    return res.status(500).json({
      message:
        'Missing anon key for signup. Set SUPABASE_ANON_KEY or ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) on the Studio server.',
    })
  }
  if (!gotrueUrlRaw) {
    return res.status(500).json({
      message:
        'Missing GoTrue URL for signup. Set GOTRUE_URL or SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) on the Studio server.',
    })
  }

  let signupUrl: URL
  try {
    signupUrl = buildSignupUrl(gotrueUrlRaw)
    if (typeof redirectTo === 'string' && redirectTo.length > 0) {
      signupUrl.searchParams.set('redirect_to', redirectTo)
    }
  } catch {
    return res.status(500).json({
      message: `Invalid GOTRUE_URL / SUPABASE_URL for signup: "${gotrueUrlRaw}"`,
    })
  }

  const anonKey = anonKeyRaw
  const gotrueUrl = gotrueUrlRaw

  const body: any = { email, password }
  if (typeof hcaptchaToken === 'string' && hcaptchaToken.length > 0) {
    body.captcha_token = hcaptchaToken
  }

  const timeoutMs = parseInt(process.env.GOTRUE_SIGNUP_TIMEOUT_MS || '8000', 10)

  async function fetchSignupWithTimeout(url: string): Promise<Response> {
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

  const gotrueBaseCandidates = [
    gotrueUrl,
    // If https is blocked but http works, try it.
    signupUrl.protocol === 'https:' && process.env.ENABLE_HTTP_GOTRUE_RETRY !== 'false'
      ? gotrueUrl.replace(/^https:/, 'http:')
      : undefined,
    // Final fallback: try kong directly (server-to-server in compose).
    kongInternalGotrueBaseUrl,
  ].filter(Boolean) as string[]

  // Deduplicate candidates.
  const uniqueCandidates = Array.from(new Set(gotrueBaseCandidates))

  const gatewayRetryStatuses = new Set([502, 503, 504])

  let r: Response | undefined
  const causes: Array<{ baseUrl: string; cause: string }> = []

  for (const baseUrlCandidate of uniqueCandidates) {
    let candidateSignupUrl: URL
    try {
      candidateSignupUrl = new URL(baseUrlCandidate.replace(/\/$/, '') + '/signup')
    } catch {
      causes.push({ baseUrl: baseUrlCandidate, cause: 'invalid_base_url' })
      continue
    }
    if (typeof redirectTo === 'string' && redirectTo.length > 0) {
      candidateSignupUrl.searchParams.set('redirect_to', redirectTo)
    }

    try {
      const attempt = await fetchSignupWithTimeout(candidateSignupUrl.toString())
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
      message: `Failed to reach GoTrue signup endpoint`,
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

    // Normalize error shape so `handleError()` can surface a useful message in the UI.
    if (!r.ok) {
      const message =
        json?.message ??
        json?.msg ??
        json?.error_description ??
        json?.error?.message ??
        'Signup failed'

      // Preserve original response payload for debugging.
      return res.status(r.status).json({
        ...(typeof json === 'object' && json ? json : {}),
        message,
        error: json?.error ?? json,
      })
    }

    // OpenAPI spec lists 201 for this route; GoTrue often returns 200 — normalize for the client.
    const successStatus = r.status === 200 ? 201 : r.status
    return res.status(successStatus).json(json)
  } catch {
    if (!r.ok) {
      return res.status(r.status).json({ message: text || 'Signup failed' })
    }
    const successStatus = r.status === 200 ? 201 : r.status
    return res.status(successStatus).send(text)
  }
}
