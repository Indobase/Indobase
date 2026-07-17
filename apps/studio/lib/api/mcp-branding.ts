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
 * MCP Streamable HTTP often writes Uint8Array chunks (not Node Buffer).
 * `String(uint8Array)` becomes comma-separated byte values ("123,34,...") which
 * clients then fail to parse as JSON — exactly the production MCP init error.
 */
export function chunkToBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  }

  if (ArrayBuffer.isView(chunk)) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  }

  if (chunk instanceof ArrayBuffer) {
    return Buffer.from(chunk)
  }

  if (typeof chunk === 'string') {
    return Buffer.from(chunk)
  }

  return Buffer.from(String(chunk ?? ''))
}

function resolveWriteCallback(encodingOrCb?: unknown, cb?: unknown): (() => void) | undefined {
  if (typeof encodingOrCb === 'function') {
    return encodingOrCb as () => void
  }

  if (typeof cb === 'function') {
    return cb as () => void
  }

  return undefined
}

/**
 * Wraps a Node ServerResponse so MCP JSON responses advertise Indobase instead of Supabase.
 */
export function withIndobaseMcpBranding(res: ServerResponse): ServerResponse {
  const chunks: Buffer[] = []
  let ended = false

  const originalWrite = res.write.bind(res)
  const originalEnd = res.end.bind(res)

  res.write = function write(chunk: unknown, encodingOrCb?: unknown, cb?: unknown) {
    if (chunk !== undefined && chunk !== null) {
      chunks.push(chunkToBuffer(chunk))
    }

    const callback = resolveWriteCallback(encodingOrCb, cb)
    if (callback) {
      queueMicrotask(callback)
    }

    return true
  } as typeof res.write

  res.end = function end(chunk?: unknown, encodingOrCb?: unknown, cb?: unknown) {
    if (ended) {
      return originalEnd(chunk as never, encodingOrCb as never, cb as never)
    }
    ended = true

    if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
      chunks.push(chunkToBuffer(chunk))
    }

    const contentType = String(res.getHeader('content-type') ?? '')
    const raw = Buffer.concat(chunks).toString('utf8')
    const callback = resolveWriteCallback(
      typeof chunk === 'function' ? chunk : encodingOrCb,
      typeof chunk === 'function' ? encodingOrCb : cb
    )

    if (contentType.includes('application/json') && raw.length > 0) {
      const branded = rewriteMcpPayload(raw)
      res.setHeader('content-length', Buffer.byteLength(branded))
      return originalEnd(branded, callback as never)
    }

    if (chunks.length > 0) {
      return originalEnd(Buffer.concat(chunks), callback as never)
    }

    return originalEnd(callback as never)
  } as typeof res.end

  return res
}
