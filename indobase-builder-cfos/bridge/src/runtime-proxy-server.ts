/**
 * Node HTTP server for the CFOS bridge with WebSocket upgrade support.
 *
 * CF OS frontends connect to `wss://<bridge-host>/api`. Hono's fetch adapter
 * alone cannot upgrade WebSockets, so we attach a native upgrade forwarder
 * on the raw Node server while keeping all other routes on Hono.
 */
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
} from 'node:http'
import type { Duplex } from 'node:stream'
import { getRequestListener } from '@hono/node-server'
import type { Hono } from 'hono'

import {
  readCookie,
  readSessionToken,
  resolveHandoffSecret,
  SESSION_COOKIE,
} from './auth.js'
import { resolveCloudflareOsBase } from './os-proxy.js'

function sessionFromUpgrade(req: IncomingMessage): boolean {
  try {
    const secret = resolveHandoffSecret()
    const raw = readCookie(req.headers.cookie, SESSION_COOKIE)
    if (!raw) return false
    return Boolean(readSessionToken(raw, secret))
  } catch {
    return false
  }
}

function isAgentRuntimeApiUpgrade(url: string | undefined): boolean {
  if (!url) return false
  const path = url.split('?')[0] || ''
  // Exact /api WebSocket used by CF OS RPC — not /api/session or /api/indobase/*
  return path === '/api'
}

function rejectUpgrade(socket: Duplex, status: number, reason: string) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

function forwardWebSocketUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, upstreamBase: string) {
  const target = new URL(req.url || '/api', `${upstreamBase}/`)
  const headers: Record<string, string | string[] | undefined> = { ...req.headers }
  headers.host = target.host
  // Drop hop-by-hop that confuses the upstream handshake
  delete headers['connection']
  delete headers['keep-alive']
  delete headers['proxy-connection']
  // workerd wrongly mirrors Accept-Encoding onto the 101 response as
  // Content-Encoding: gzip, which breaks browser WebSockets → "Can't reach the server".
  delete headers['accept-encoding']
  // Keep upgrade + sec-websocket-* headers from the client

  const proxyReq = httpRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers,
    },
    () => {
      // Non-upgrade response — should not happen for WS
      rejectUpgrade(socket, 502, 'Bad Gateway')
    }
  )

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const lines = [`HTTP/1.1 ${proxyRes.statusCode || 101} Switching Protocols`]
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value === undefined) continue
      const lower = key.toLowerCase()
      // Never forward encoding / length on a WebSocket handshake.
      if (
        lower === 'content-encoding' ||
        lower === 'content-length' ||
        lower === 'transfer-encoding'
      ) {
        continue
      }
      if (Array.isArray(value)) {
        for (const v of value) lines.push(`${key}: ${v}`)
      } else {
        lines.push(`${key}: ${value}`)
      }
    }
    lines.push('', '')
    socket.write(lines.join('\r\n'))
    if (proxyHead.length) proxySocket.write(proxyHead)
    if (head.length) socket.write(head)

    proxySocket.pipe(socket)
    socket.pipe(proxySocket)

    const hangup = () => {
      proxySocket.destroy()
      socket.destroy()
    }
    proxySocket.on('error', hangup)
    socket.on('error', hangup)
  })

  proxyReq.on('error', (err) => {
    console.error('[builder-cfos] runtime ws proxy error:', err.message)
    rejectUpgrade(socket, 502, 'Bad Gateway')
  })

  proxyReq.end()
}

export function createRuntimeProxyServer(app: Hono, port: number): Server {
  const listener = getRequestListener(app.fetch)
  const server = createServer(listener)

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isAgentRuntimeApiUpgrade(req.url)) {
      rejectUpgrade(socket, 404, 'Not Found')
      return
    }

    if (!sessionFromUpgrade(req)) {
      rejectUpgrade(socket, 401, 'Unauthorized')
      return
    }

    const upstream = resolveCloudflareOsBase()
    if (!upstream) {
      rejectUpgrade(socket, 503, 'Service Unavailable')
      return
    }

    forwardWebSocketUpgrade(req, socket, head, upstream)
  })

  server.listen(port)
  return server
}
