import { describe, expect, it } from 'vitest'

import { chunkToBuffer, withIndobaseMcpBranding } from './mcp-branding'

function createMockResponse() {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' } as Record<string, string | number>,
    getHeader(name: string) {
      return this.headers[name.toLowerCase()]
    },
    setHeader(name: string, value: string | number) {
      this.headers[name.toLowerCase()] = value
    },
    chunks: [] as Buffer[],
    write(chunk: Buffer | string) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      return true
    },
    end(chunk?: Buffer | string | (() => void), cb?: () => void) {
      if (typeof chunk === 'function') {
        chunk()
        this.ended = Buffer.concat(this.chunks).toString('utf8')
        return
      }

      if (chunk !== undefined) {
        this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }

      this.ended = Buffer.concat(this.chunks).toString('utf8')
      cb?.()
    },
    ended: '',
  }
}

describe('chunkToBuffer', () => {
  it('preserves Uint8Array bytes instead of String(uint8Array) comma lists', () => {
    const payload = '{"result":{"serverInfo":{"name":"supabase"}}}'
    const bytes = new Uint8Array(Buffer.from(payload))

    expect(String(bytes).startsWith('123,')).toBe(true)
    expect(chunkToBuffer(bytes).toString('utf8')).toBe(payload)
  })
})

describe('withIndobaseMcpBranding', () => {
  it('rewrites MCP initialize serverInfo in JSON responses', async () => {
    const res = createMockResponse()
    const branded = withIndobaseMcpBranding(res as never)
    branded.write(
      JSON.stringify({
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'supabase', title: 'Supabase' },
        },
      })
    )
    branded.end()

    const body = JSON.parse(res.ended)
    expect(body.result.serverInfo).toEqual({
      name: 'indobase',
      title: 'Indobase',
      version: '1.0.0',
    })
  })

  it('handles Uint8Array chunks from StreamableHTTP without corrupting JSON', () => {
    const res = createMockResponse()
    const branded = withIndobaseMcpBranding(res as never)
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'supabase', title: 'Supabase', version: '0.0.0' },
      },
    })

    branded.write(new Uint8Array(Buffer.from(payload)))
    branded.end()

    const body = JSON.parse(res.ended)
    expect(body.result.serverInfo.name).toBe('indobase')
    expect(body.result.serverInfo.title).toBe('Indobase')
    // Must never look like comma-separated byte values
    expect(res.ended.startsWith('123,')).toBe(false)
  })
})
