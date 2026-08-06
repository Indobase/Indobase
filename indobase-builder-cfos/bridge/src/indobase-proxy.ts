/**
 * Session-authenticated proxy to the linked Indobase project API (anon key).
 * Lets the CF OS chrome / operators call tenant REST without pasting keys.
 */
import type { Context } from 'hono'

import type { Session } from './auth.js'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'cookie',
  'authorization',
  'apikey',
])

export async function proxyIndobaseApi(
  c: Context,
  session: Session,
  opts: { stripPrefix: string }
) {
  if (!session.backend?.api_url || !session.backend.anon_key) {
    return c.json({ message: 'No Indobase backend on this session' }, 400)
  }

  const url = new URL(c.req.url)
  let path = url.pathname
  if (path.startsWith(opts.stripPrefix)) {
    path = path.slice(opts.stripPrefix.length) || '/'
  }
  if (!path.startsWith('/')) path = `/${path}`

  const base = session.backend.api_url.replace(/\/+$/, '')
  const target = new URL(path + url.search, `${base}/`)

  const headers = new Headers()
  c.req.raw.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return
    headers.set(key, value)
  })
  headers.set('apikey', session.backend.anon_key)
  headers.set('Authorization', `Bearer ${session.backend.anon_key}`)
  headers.set('host', target.host)
  headers.delete('accept-encoding')

  const init: RequestInit = {
    method: c.req.method,
    headers,
    redirect: 'manual',
  }
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    init.body = c.req.raw.body
    // @ts-expect-error duplex for streaming
    init.duplex = 'half'
  }

  try {
    const upstream = await fetch(target, init)
    const out = new Headers()
    upstream.headers.forEach((value, key) => {
      if (HOP_BY_HOP.has(key.toLowerCase())) return
      out.set(key, value)
    })
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    })
  } catch (err) {
    return c.json(
      {
        message: err instanceof Error ? err.message : 'Indobase API unreachable',
        api_url: base,
      },
      502
    )
  }
}
