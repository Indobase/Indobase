import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { backendFromEnsureResult, backendConfigFromGuidedSnapshot } from './backend-session-sync.ts'

describe('backend-session-sync', () => {
  it('backendFromEnsureResult returns null when ok is false', () => {
    assert.equal(
      backendFromEnsureResult({
        ok: false,
        backend: { api_url: 'https://x.indobase.in', anon_key: 'k' } as never,
      }),
      null,
    )
  })

  it('backendFromEnsureResult returns backend when keys present', () => {
    const backend = {
      api_url: 'https://sprout.indobase.in',
      anon_key: 'anon-key',
      auth_url: 'https://sprout.indobase.in/auth/v1',
      rest_url: 'https://sprout.indobase.in/rest/v1/',
      storage_url: 'https://sprout.indobase.in/storage/v1',
      project_ref: 'sprout-abc',
      project_name: 'Sprout',
      project_url: 'https://studio.indobase.in/project/sprout-abc/backend',
    }
    assert.deepEqual(backendFromEnsureResult({ ok: true, backend }), backend)
  })

  it('backendConfigFromGuidedSnapshot fills auth/rest/storage urls', () => {
    const cfg = backendConfigFromGuidedSnapshot(
      { api_url: 'https://app.indobase.in', anon_key: 'key' },
      { projectRef: 'app-1', projectName: 'App' },
    )
    assert.equal(cfg.auth_url, 'https://app.indobase.in/auth/v1')
    assert.equal(cfg.rest_url, 'https://app.indobase.in/rest/v1/')
    assert.equal(cfg.project_ref, 'app-1')
  })
})
