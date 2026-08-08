import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'runtime-proxy-server.ts'), 'utf8')
const osProxy = readFileSync(join(here, 'os-proxy.ts'), 'utf8')

describe('runtime WS / HTML proxy encoding guards', () => {
  it('drops accept-encoding on upstream WS upgrade (workerd mirrors it onto 101)', () => {
    assert.match(src, /delete headers\['accept-encoding'\]/)
  })

  it('strips content-encoding from the 101 Switching Protocols response', () => {
    assert.match(src, /lower === 'content-encoding'/)
    assert.match(src, /lower === 'content-length'/)
    assert.match(src, /lower === 'transfer-encoding'/)
  })

  it('strips content-encoding after HTML rewrite in os-proxy', () => {
    assert.match(osProxy, /'content-encoding'/)
    assert.match(osProxy, /headers\.delete\('accept-encoding'\)/)
  })
})
