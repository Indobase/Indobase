import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { rememberArtifact, currentArtifact, liveArtifact, markArtifactLive } from './artifact-store.ts'
import { bindHostToProject } from './host-binding-store.ts'
import { parsePreviewBootMessage, PREVIEW_BOOT_EVENT } from './preview-boot.ts'

describe('immutable artifact + host ownership', () => {
  it('MODIFY creates artifact B while A remains stored', () => {
    const a = rememberArtifact({
      projectRef: 'proj_mod_a',
      applicationType: 'ecommerce',
      files: { 'index.html': '<h1>A</h1>' },
    })
    const b = rememberArtifact({
      projectRef: 'proj_mod_a',
      applicationType: 'ecommerce',
      files: { 'index.html': '<h1>B</h1>' },
      predecessorId: a.artifactId,
    })
    assert.notEqual(a.artifactId, b.artifactId)
    assert.equal(currentArtifact('proj_mod_a')?.artifactId, b.artifactId)
    markArtifactLive('proj_mod_a', a.artifactId)
    assert.equal(liveArtifact('proj_mod_a')?.artifactId, a.artifactId)
    assert.equal(currentArtifact('proj_mod_a')?.artifactId, b.artifactId)
  })

  it('rejects host reuse across projects', () => {
    const first = bindHostToProject({
      host: 'corev1-aug13.sites.indobase.in',
      projectRef: 'old_workspace',
    })
    assert.equal(first.ok, true)
    const stolen = bindHostToProject({
      host: 'corev1-aug13.sites.indobase.in',
      projectRef: 'roshabc123',
    })
    assert.equal(stolen.ok, false)
  })

  it('rejects spoofed iframe postMessage', () => {
    const payload = {
      type: PREVIEW_BOOT_EVENT,
      projectRef: 'proj_x',
      artifactHash: 'h1',
      runtimeVersion: 'v1' as const,
    }
    const spoof = parsePreviewBootMessage(payload, {
      projectRef: 'proj_x',
      allowedOrigins: ['https://builder.indobase.in'],
    }, 'https://attacker.example')
    assert.equal(spoof.ok, false)
  })
})
