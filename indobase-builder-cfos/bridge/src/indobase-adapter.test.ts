import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildAgentHint, buildAgentSessionContext, stripVendorBranding } from './indobase-adapter.ts'
import type { Session } from './auth.ts'

const sampleSession: Session = {
  gotrueId: 'user_1',
  email: 'op@indobase.in',
  projectRef: 'proj_demo',
  orgSlug: 'acme',
  projectName: 'Demo App',
  studioUrl: 'https://studio.indobase.in',
  backend: {
    anon_key: 'anon',
    api_url: 'https://proj_demo.indobase.in',
    auth_url: 'https://proj_demo.indobase.in/auth/v1',
    project_name: 'Demo App',
    project_ref: 'proj_demo',
    project_url: 'https://proj_demo.indobase.in',
    rest_url: 'https://proj_demo.indobase.in/rest/v1/',
    storage_url: 'https://proj_demo.indobase.in/storage/v1',
  },
}

describe('indobase-adapter bridge wiring', () => {
  it('builds generation context without vendor product naming', () => {
    const ctx = buildAgentSessionContext(sampleSession)
    assert.equal(ctx.projectRef, 'proj_demo')
    assert.equal(ctx.generation.projectRef, 'proj_demo')
    assert.match(ctx.agentHint, /Indobase Builder/)
    assert.match(ctx.agentHint, /format\.design/)
    assert.match(ctx.agentHint, /ALWAYS/)
    assert.match(ctx.agentHint, /NEVER/)
    assert.match(ctx.agentHint, /Slides/)
    assert.doesNotMatch(ctx.agentHint, /Cloudflare/i)
  })

  it('buildAgentHint matches adapter session hint', () => {
    const hint = buildAgentHint(sampleSession)
    assert.equal(hint, buildAgentSessionContext(sampleSession).agentHint)
  })

  it('stripVendorBranding rewrites gadget language', () => {
    assert.equal(stripVendorBranding('Install a Gadget'), 'Install an App')
  })
})
