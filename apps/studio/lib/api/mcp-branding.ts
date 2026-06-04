import type { ServerResponse } from 'http'

const INDOBASE_SERVER_INFO = {
  name: 'indobase',
  title: 'Indobase',
  version: '1.0.0',
} as const

function rewriteMcpPayload(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const result = parsed.result
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const record = result as Record<string, unknown>
      if (record.serverInfo && typeof record.serverInfo === 'object') {
        record.serverInfo = { ...(record.serverInfo as object), ...INDOBASE_SERVER_INFO }
      }
    }
    return JSON.stringify(parsed)
  } catch {
    return body
  }
}

/**
 * Wraps a Node ServerResponse so MCP JSON responses advertise Indobase instead of Supabase.
 */
export function withIndobaseMcpBranding(res: ServerResponse): ServerResponse {
  const chunks: Buffer[] = []
  let ended = false

  const originalWrite = res.write.bind(res)
  const originalEnd = res.end.bind(res)

  res.write = function write(chunk: unknown, ...args: unknown[]) {
    if (chunk !== undefined && chunk !== null) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    }
    return true
  } as typeof res.write

  res.end = function end(chunk?: unknown, ...args: unknown[]) {
    if (ended) return originalEnd(chunk as never, ...(args as never))
    ended = true

    if (chunk !== undefined && chunk !== null) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    }

    const contentType = String(res.getHeader('content-type') ?? '')
    const raw = Buffer.concat(chunks).toString('utf8')

    if (contentType.includes('application/json') && raw.length > 0) {
      const branded = rewriteMcpPayload(raw)
      res.setHeader('content-length', Buffer.byteLength(branded))
      return originalEnd(branded, ...(args as never))
    }

    if (chunks.length > 0) {
      return originalEnd(Buffer.concat(chunks), ...(args as never))
    }

    return originalEnd(chunk as never, ...(args as never))
  } as typeof res.end

  return res
}
