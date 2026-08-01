import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  derivedCrmPassword,
  exchangeStudioUserForTwentyLoginToken,
  twentyVerifyPath,
} from './twenty-exchange.js'
import {
  countMappedWorkspaces,
  getOrgWorkspace,
  saveOrgWorkspace,
} from './workspace-map.js'

test('derivedCrmPassword is stable and meets complexity floor', () => {
  const secret = 'a'.repeat(32)
  const a = derivedCrmPassword('Owner@Example.com', secret)
  const b = derivedCrmPassword('owner@example.com', secret)
  assert.equal(a, b)
  assert.match(a, /^Ib1!/)
  assert.ok(a.length >= 12)
  assert.notEqual(a, derivedCrmPassword('other@example.com', secret))
})

test('twentyVerifyPath encodes loginToken', () => {
  assert.equal(twentyVerifyPath('tok123'), '/verify?loginToken=tok123')
  assert.equal(
    twentyVerifyPath('tok123', '/objects/opportunities'),
    '/verify?loginToken=tok123&redirect=%2Fobjects%2Fopportunities',
  )
})

test('workspace map persists org → workspace by teamKey', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-ws-map-'))
  const path = join(dir, 'workspace-map.json')
  process.env.CRM_WORKSPACE_MAP_PATH = path
  try {
    assert.equal(countMappedWorkspaces(), 0)
    saveOrgWorkspace({
      orgSlug: 'acme',
      teamKey: 'ib-crm-org-acme',
      workspaceId: 'ws-1',
      inviteHash: 'invite-hash-1',
      subdomain: 'o-acme',
      displayName: 'Acme Inc',
      createdAt: '2026-08-01T00:00:00.000Z',
    })
    assert.equal(countMappedWorkspaces(), 1)
    const got = getOrgWorkspace('ib-crm-org-acme')
    assert.ok(got)
    assert.equal(got.workspaceId, 'ws-1')
    assert.equal(got.inviteHash, 'invite-hash-1')
    assert.equal(getOrgWorkspace('ib-crm-org-other'), null)
  } finally {
    delete process.env.CRM_WORKSPACE_MAP_PATH
    rmSync(dir, { recursive: true, force: true })
  }
})

test('exchange uses mapped invite and does not create when user can sign in', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-ws-ex-'))
  const path = join(dir, 'workspace-map.json')
  process.env.CRM_WORKSPACE_MAP_PATH = path
  saveOrgWorkspace({
    orgSlug: 'acme',
    teamKey: 'ib-crm-org-acme',
    workspaceId: 'ws-acme',
    inviteHash: 'hash-acme',
    subdomain: 'o-acme',
    displayName: 'Acme',
    createdAt: new Date().toISOString(),
  })

  const calls: string[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as { query?: string }
    const q = body.query || ''
    calls.push(q.includes('signIn') ? 'signIn' : q.includes('signUpInWorkspace') ? 'signUpInWorkspace' : 'other')
    if (q.includes('mutation SignIn')) {
      return new Response(
        JSON.stringify({
          data: {
            signIn: {
              tokens: {
                accessOrWorkspaceAgnosticToken: { token: 'agnostic' },
                refreshToken: { token: 'r' },
              },
              availableWorkspaces: {
                availableWorkspacesForSignIn: [
                  { id: 'ws-acme', loginToken: 'login-from-signin', inviteHash: 'hash-acme' },
                ],
                availableWorkspacesForSignUp: [],
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response(JSON.stringify({ errors: [{ message: 'unexpected' }] }), { status: 200 })
  }) as typeof fetch

  try {
    const result = await exchangeStudioUserForTwentyLoginToken({
      upstream: 'http://crm-upstream',
      email: 'owner@example.com',
      handoffSecret: 's'.repeat(32),
      orgSlug: 'acme',
      teamKey: 'ib-crm-org-acme',
      teamTitle: 'Acme',
      publicBaseUrl: 'https://crm.indobase.in',
      allowCreateWorkspace: true,
    })
    assert.equal(result.loginToken, 'login-from-signin')
    assert.equal(result.created, false)
    assert.equal(result.workspaceId, 'ws-acme')
    assert.ok(calls.includes('signIn'))
    assert.ok(!calls.includes('signUpInWorkspace'))
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.CRM_WORKSPACE_MAP_PATH
    rmSync(dir, { recursive: true, force: true })
  }
})

test('exchange provisions a new workspace when org has no mapping', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-ws-prov-'))
  const path = join(dir, 'workspace-map.json')
  process.env.CRM_WORKSPACE_MAP_PATH = path

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as {
      query?: string
      variables?: Record<string, unknown>
    }
    const q = body.query || ''
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization

    if (q.includes('mutation SignIn')) {
      return new Response(JSON.stringify({ errors: [{ message: 'User not found' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (q.includes('mutation SignUp(') || q.includes('mutation SignUp\n') || q.includes('signUp(email')) {
      return new Response(
        JSON.stringify({
          data: {
            signUp: {
              tokens: {
                accessOrWorkspaceAgnosticToken: { token: 'new-user-token' },
                refreshToken: { token: 'r' },
              },
              availableWorkspaces: {
                availableWorkspacesForSignIn: [],
                availableWorkspacesForSignUp: [],
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (q.includes('signUpInNewWorkspace')) {
      assert.equal(auth, 'Bearer new-user-token')
      const input = body.variables?.input as { displayName?: string; subdomain?: string }
      assert.equal(input?.subdomain, 'o-beta')
      return new Response(
        JSON.stringify({
          data: {
            signUpInNewWorkspace: {
              loginToken: { token: 'ws-login' },
              workspace: {
                id: 'ws-beta',
                workspaceUrls: { subdomainUrl: 'https://o-beta.crm.indobase.in' },
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (q.includes('getAuthTokensFromLoginToken')) {
      assert.equal(body.variables?.origin, 'https://o-beta.crm.indobase.in')
      return new Response(
        JSON.stringify({
          data: {
            getAuthTokensFromLoginToken: {
              tokens: {
                accessOrWorkspaceAgnosticToken: { token: 'ws-access' },
                refreshToken: { token: 'r' },
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (q.includes('activateWorkspace')) {
      assert.equal(auth, 'Bearer ws-access')
      return new Response(
        JSON.stringify({
          data: {
            activateWorkspace: {
              id: 'ws-beta',
              inviteHash: 'invite-beta',
              subdomain: 'o-beta',
              displayName: 'Beta Org',
              activationStatus: 'ACTIVE',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response(JSON.stringify({ errors: [{ message: `unexpected: ${q.slice(0, 80)}` }] }), {
      status: 200,
    })
  }) as typeof fetch

  try {
    const result = await exchangeStudioUserForTwentyLoginToken({
      upstream: 'http://crm-upstream',
      email: 'owner@beta.test',
      handoffSecret: 's'.repeat(32),
      orgSlug: 'beta',
      teamKey: 'ib-crm-org-beta',
      teamTitle: 'Beta Org',
      publicBaseUrl: 'https://crm.indobase.in',
      allowCreateWorkspace: true,
    })
    assert.equal(result.loginToken, 'ws-login')
    assert.equal(result.created, true)
    assert.equal(result.workspaceId, 'ws-beta')
    assert.equal(result.inviteHash, 'invite-beta')
    const mapped = getOrgWorkspace('ib-crm-org-beta')
    assert.ok(mapped)
    assert.equal(mapped.inviteHash, 'invite-beta')
    assert.equal(mapped.subdomain, 'o-beta')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.CRM_WORKSPACE_MAP_PATH
    rmSync(dir, { recursive: true, force: true })
  }
})
