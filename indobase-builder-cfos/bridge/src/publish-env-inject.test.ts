import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { injectIndobaseEnvIntoHtml, injectIndobaseEnvIntoLaunchContent } from './publish-env-inject.ts'

describe('publish-env-inject', () => {
  it('injects env script before </head>', () => {
    const out = injectIndobaseEnvIntoHtml('<html><head></head><body></body></html>', {
      INDOBASE_URL: 'https://app.indobase.in',
      INDOBASE_ANON_KEY: 'anon',
    })
    assert.match(out, /window\.__INDOBASE_ENV__/)
    assert.match(out, /app\.indobase\.in/)
  })

  it('skips when env already present', () => {
    const html = '<html><script>window.__INDOBASE_ENV__={}</script></html>'
    assert.equal(injectIndobaseEnvIntoHtml(html, { INDOBASE_URL: 'x' }), html)
  })

  it('injects into files map', () => {
    const { files } = injectIndobaseEnvIntoLaunchContent({
      files: { 'index.html': '<html><head></head><body></body></html>' },
      backend: {
        api_url: 'https://ws.indobase.in',
        anon_key: 'key',
        auth_url: 'https://ws.indobase.in/auth/v1',
        rest_url: 'https://ws.indobase.in/rest/v1/',
        storage_url: 'https://ws.indobase.in/storage/v1',
        project_ref: 'ws',
        project_name: 'Ws',
        project_url: 'https://studio.indobase.in/project/ws/backend',
      },
    })
    assert.ok(files?.['index.html']?.includes('__INDOBASE_ENV__'))
  })
})
