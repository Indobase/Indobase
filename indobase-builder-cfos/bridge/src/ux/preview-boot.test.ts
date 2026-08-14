import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { inferBusinessSpec } from './business-spec.ts'
import { buildPreviewFiles } from './preview-artifact.ts'
import { parsePreviewBootMessage, PREVIEW_BOOT_EVENT } from './preview-boot.ts'

describe('preview boot handshake', () => {
  it('rejects spoofed postMessage from the wrong origin or project', () => {
    const payload = {
      type: PREVIEW_BOOT_EVENT,
      projectRef: 'proj_masala',
      artifactHash: 'abc',
      runtimeVersion: 'v1' as const,
    }
    const badOrigin = parsePreviewBootMessage(payload, {
      projectRef: 'proj_masala',
      allowedOrigins: ['https://builder.indobase.in'],
    }, 'https://evil.example')
    assert.equal(badOrigin.ok, false)
    const badRef = parsePreviewBootMessage(payload, {
      projectRef: 'proj_other',
      allowedOrigins: ['https://builder.indobase.in'],
    }, 'https://builder.indobase.in')
    assert.equal(badRef.ok, false)
    const ok = parsePreviewBootMessage(payload, {
      projectRef: 'proj_masala',
      allowedOrigins: ['https://builder.indobase.in'],
    }, 'https://builder.indobase.in')
    assert.equal(ok.ok, true)
  })

  it('embeds boot marker and projectRef in generated preview HTML', () => {
    const spec = inferBusinessSpec('create me a ecommerce site for a masala store')
    const html = buildPreviewFiles(spec, 'proj_masala_boot')['index.html'] || ''
    assert.match(html, /data-ib-boot="1"/)
    assert.match(html, /INDOBASE_PREVIEW_READY/)
    assert.match(html, /proj_masala_boot/)
    assert.doesNotMatch(html, /Circuit Nest/)
  })
})
