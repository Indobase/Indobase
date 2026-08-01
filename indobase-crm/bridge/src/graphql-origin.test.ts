import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { rewriteGraphqlOriginBody, rewriteUpstreamLocation } from './graphql-origin.js'
import { saveOrgWorkspace } from './workspace-map.js'

test('rewriteGraphqlOriginBody swaps apex origin for org workspace origin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-origin-'))
  const path = join(dir, 'workspace-map.json')
  process.env.CRM_WORKSPACE_MAP_PATH = path
  saveOrgWorkspace({
    orgSlug: 'acme',
    teamKey: 'ib-crm-org-acme',
    workspaceId: 'ws-1',
    inviteHash: 'h1',
    subdomain: 'o-acme',
    displayName: 'Acme',
    createdAt: new Date().toISOString(),
  })

  try {
    const body = JSON.stringify({
      query: 'mutation($loginToken: String!, $origin: String!) { getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) { tokens { accessOrWorkspaceAgnosticToken { token } } } }',
      variables: {
        loginToken: 'tok',
        origin: 'https://crm.indobase.in',
      },
    })
    const next = rewriteGraphqlOriginBody(body, {
      publicBaseUrl: 'https://crm.indobase.in',
      orgSlug: 'acme',
    })
    const parsed = JSON.parse(next) as { variables: { origin: string } }
    assert.equal(parsed.variables.origin, 'https://o-acme.crm.indobase.in')
  } finally {
    delete process.env.CRM_WORKSPACE_MAP_PATH
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rewriteUpstreamLocation maps workspace subdomain back to public host', () => {
  assert.equal(
    rewriteUpstreamLocation(
      'https://o-acme.crm.indobase.in/objects/opportunities',
      'https://crm.indobase.in',
    ),
    'https://crm.indobase.in/objects/opportunities',
  )
  assert.equal(
    rewriteUpstreamLocation('https://crm.indobase.in/verify', 'https://crm.indobase.in'),
    'https://crm.indobase.in/verify',
  )
})
