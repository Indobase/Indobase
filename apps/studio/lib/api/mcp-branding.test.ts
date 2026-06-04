import { describe, expect, it } from 'vitest'

import { withIndobaseMcpBranding } from './mcp-branding'

describe('withIndobaseMcpBranding', () => {
  it('rewrites MCP initialize serverInfo in JSON responses', async () => {
    const res = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      getHeader(name: string) {
        return this.headers[name.toLowerCase()]
      },
      setHeader() {},
      chunks: [] as Buffer[],
      write(chunk: Buffer | string) {
        this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        return true
      },
      end(chunk?: Buffer | string) {
        if (chunk !== undefined) {
          this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        this.ended = Buffer.concat(this.chunks).toString('utf8')
      },
      ended: '',
    }

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
})
