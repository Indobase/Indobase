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

  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_ANON_KEY
  // IMPORTANT: Avoid using NEXT_PUBLIC_* vars in server routes as they can be
  // inlined at build time. Always prefer runtime server env values.
  const gotrueUrl =
    process.env.GOTRUE_URL ||
    (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1` : '')

  if (!anonKey) {
    return res.status(500).json({ message: 'Missing SUPABASE_ANON_KEY' })
  }
  if (!gotrueUrl) {
    return res.status(500).json({ message: 'Missing GOTRUE_URL (or SUPABASE_URL)' })
  }

  const signupUrl = new URL(gotrueUrl.replace(/\/$/, '') + '/signup')
  if (typeof redirectTo === 'string' && redirectTo.length > 0) {
    signupUrl.searchParams.set('redirect_to', redirectTo)
  }

  const body: any = { email, password }
  if (typeof hcaptchaToken === 'string' && hcaptchaToken.length > 0) {
    body.captcha_token = hcaptchaToken
  }

  let r: Response
  try {
    r = await fetch(signupUrl.toString(), {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e: any) {
    // Make debugging deploy/network issues possible from the browser.
    // Do not include secrets in the response.
    return res.status(502).json({
      message: 'Failed to reach GoTrue signup endpoint',
      error: {
        target: signupUrl.toString(),
        gotrueUrlSource: process.env.GOTRUE_URL ? 'GOTRUE_URL' : 'SUPABASE_URL',
        gotrueUrl,
        cause: e?.cause?.code ?? e?.code ?? e?.message ?? String(e),
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

    return res.status(r.status).json(json)
  } catch {
    if (!r.ok) {
      return res.status(r.status).json({ message: text || 'Signup failed' })
    }
    return res.status(r.status).send(text)
  }
}
