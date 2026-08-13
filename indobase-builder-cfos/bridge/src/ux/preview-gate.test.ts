import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { previewIsReady, resolvePreviewGate } from './preview-gate.ts'

describe('preview hard gate', () => {
  it('does not treat a constructed path as ready', () => {
    const gate = resolvePreviewGate({ previewUrl: '/live/rosh6f3e742e3d/' })
    assert.equal(gate.status, 'absent')
    assert.equal(gate.url, null)
    assert.equal(previewIsReady(gate.status), false)
  })

  it('is ready only when an artifact or published host exists', () => {
    const draft = resolvePreviewGate({
      artifactExists: true,
      previewUrl: 'https://builder.indobase.in/live/urban/',
    })
    assert.equal(draft.status, 'ready')
    assert.equal(draft.url, 'https://builder.indobase.in/live/urban/')

    const live = resolvePreviewGate({
      published: true,
      liveUrl: 'https://urbanthread.sites.indobase.in',
    })
    assert.equal(live.status, 'ready')
    assert.equal(live.url, 'https://urbanthread.sites.indobase.in')
  })

  it('fails closed when HTTP probe says the preview is down', () => {
    const gate = resolvePreviewGate({
      artifactExists: true,
      previewUrl: 'https://builder.indobase.in/live/urban/',
      httpOk: false,
    })
    assert.equal(gate.status, 'failed')
  })

  it('is building while a job is running without an artifact', () => {
    const gate = resolvePreviewGate({ jobStatus: 'running' })
    assert.equal(gate.status, 'building')
    assert.equal(gate.url, null)
  })
})
