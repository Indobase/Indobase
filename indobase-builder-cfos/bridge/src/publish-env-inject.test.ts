import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  injectIndobaseEnvIntoHtml,
  injectIndobaseEnvIntoLaunchContent,
  buildIndobasePublicEnv,
} from './publish-env-inject.ts'

describe('publish-env-inject', () => {
  it('injects env script before </head>', () => {
    const out = injectIndobaseEnvIntoHtml('<html><head></head><body></body></html>', {
      INDOBASE_URL: 'https://app.indobase.in',
      INDOBASE_ANON_KEY: 'anon',
    })
    assert.match(out, /window\.__INDOBASE_ENV__/)
    assert.match(out, /app\.indobase\.in/)
    assert.match(out, /__INDOBASE_COLLECTION__/)
  })

  it('replaces stale __INDOBASE_ENV__ script', () => {
    const html = '<html><script>window.__INDOBASE_ENV__={}</script></html>'
    const out = injectIndobaseEnvIntoHtml(html, { INDOBASE_URL: 'https://x.indobase.in' })
    assert.match(out, /x\.indobase\.in/)
    assert.equal(out.includes('window.__INDOBASE_ENV__={}'), false)
  })

  it('injects managed records ABI into files map', () => {
    const { files } = injectIndobaseEnvIntoLaunchContent({
      files: { 'index.html': '<html><head></head><body></body></html>' },
      backend: {
        api_url: 'https://backend.indobase.in',
        anon_key: 'public',
        auth_url: 'https://backend.indobase.in/api/collections/users',
        rest_url: 'https://backend.indobase.in/api/collections',
        storage_url: 'https://backend.indobase.in/api/files',
        project_ref: 'ws1',
        project_name: 'Ws',
        project_url: 'https://backend.indobase.in',
        public_env: { INDOBASE_BACKEND_KIND: 'records' },
      },
    })
    assert.ok(files?.['index.html']?.includes('__INDOBASE_ENV__'))
    assert.ok(files?.['index.html']?.includes('INDOBASE_COLLECTION_PREFIX'))
  })

  it('buildIndobasePublicEnv uses records paths for managed keys', () => {
    const env = buildIndobasePublicEnv({
      api_url: 'https://backend.indobase.in',
      anon_key: 'public',
      auth_url: 'https://backend.indobase.in/api/collections/users',
      rest_url: 'https://backend.indobase.in/api/collections',
      storage_url: 'https://backend.indobase.in/api/files',
      project_ref: 'abc',
      project_name: 'A',
      project_url: 'https://backend.indobase.in',
    })
    assert.equal(env.INDOBASE_BACKEND_KIND, 'records')
    assert.doesNotMatch(env.INDOBASE_REST_URL || '', /\/rest\/v1/)
  })
})
