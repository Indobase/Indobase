import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  PREVIEW_EMBED_CSP,
  embeddablePreviewPath,
  embeddablePreviewSrc,
  isEmbeddablePreviewUrl,
  isLivePreviewPath,
  previewEmbedResponseHeaders,
} from './preview-embed.ts'

describe('preview embed lane', () => {
  it('uses same-origin /live/{ref}/ and never sites.indobase.in', () => {
    assert.equal(embeddablePreviewPath('abc123'), '/live/abc123/')
    assert.equal(isEmbeddablePreviewUrl('/live/abc123/'), true)
    assert.equal(isEmbeddablePreviewUrl('https://builder.indobase.in/live/abc123/'), true)
    assert.equal(isEmbeddablePreviewUrl('https://urbanthread.sites.indobase.in'), false)
    assert.equal(
      embeddablePreviewSrc({
        projectRef: 'abc123',
        previewUrl: 'https://urbanthread.sites.indobase.in',
        liveUrl: 'https://urbanthread.sites.indobase.in',
      }),
      '/live/abc123/',
    )
  })

  it('allows framing only on /live/ and not globally', () => {
    assert.equal(isLivePreviewPath('/live/abc123/'), true)
    assert.equal(isLivePreviewPath('/api/session'), false)
    assert.equal(previewEmbedResponseHeaders()['Content-Security-Policy'], PREVIEW_EMBED_CSP)
    assert.equal(PREVIEW_EMBED_CSP, "frame-ancestors 'self'")
    assert.equal('X-Frame-Options' in previewEmbedResponseHeaders(), false)
  })
})
