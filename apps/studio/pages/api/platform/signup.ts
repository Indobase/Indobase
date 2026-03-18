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
    return res.status(400).json({ error: { message: 'Email and password are required' } })
  }

  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_ANON_KEY
  const gotrueUrl =
    process.env.NEXT_PUBLIC_GOTRUE_URL ||
    (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1` : '')

  if (!anonKey) {
    return res.status(500).json({ error: { message: 'Missing SUPABASE_ANON_KEY' } })
  }
  if (!gotrueUrl) {
    return res.status(500).json({ error: { message: 'Missing NEXT_PUBLIC_GOTRUE_URL (or SUPABASE_URL)' } })
  }

  const signupUrl = new URL(gotrueUrl.replace(/\/$/, '') + '/signup')
  if (typeof redirectTo === 'string' && redirectTo.length > 0) {
    signupUrl.searchParams.set('redirect_to', redirectTo)
  }

  const body: any = { email, password }
  if (typeof hcaptchaToken === 'string' && hcaptchaToken.length > 0) {
    body.captcha_token = hcaptchaToken
  }

  const r = await fetch(signupUrl.toString(), {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await r.text()
  try {
    const json = text ? JSON.parse(text) : null
    return res.status(r.status).json(json)
  } catch {
    return res.status(r.status).send(text)
  }
}
