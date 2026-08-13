import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertIdentityAdapter,
  type IdentityAdapter,
  type IdentitySession,
} from '@indobase/platform'
import type { OsWorkspaceSession } from '@indobase/platform-api'

import {
  identitySessionFromOsWorkspace,
  osWorkspaceFromIdentitySession,
  pocketBaseIdentityAdapter,
} from './identity-adapter.ts'
import { pocketBaseCapabilityAdapter } from './capability-adapter.ts'
import { pocketBaseBusinessDataAdapter } from './business-data-adapter.ts'

describe('PocketBase identity / data / capability façades', () => {
  it('types CFOS OTP as IdentityAdapter — PocketBase is the impl', () => {
    const adapter: IdentityAdapter = assertIdentityAdapter(pocketBaseIdentityAdapter)
    assert.equal(typeof adapter.startOtp, 'function')
    assert.equal(typeof adapter.verifyOtp, 'function')
    assert.equal(typeof pocketBaseCapabilityAdapter.ensure, 'function')
    assert.equal(typeof pocketBaseBusinessDataAdapter.listOrders, 'function')
  })

  it('round-trips OS session without naming the engine', () => {
    const os: OsWorkspaceSession = {
      gotrue_id: 'usr_1',
      email: 'op@indobase.in',
      workspace_ref: 'biz_ut',
      organization_slug: 'indobase',
      workspace_name: 'UrbanThread',
      provision_state: 'ready',
      backend: {
        anon_key: 'public',
        api_url: 'https://data.example',
        auth_url: 'https://data.example/api/collections/users',
        project_name: 'UrbanThread',
        project_ref: 'biz_ut',
        project_url: 'https://data.example',
        rest_url: 'https://data.example/api/collections',
        storage_url: 'https://data.example/api/files',
      },
    }
    const identity: IdentitySession = identitySessionFromOsWorkspace(os)
    assert.equal(identity.identity.email, 'op@indobase.in')
    assert.equal(identity.business.ref, 'biz_ut')
    assert.equal(identity.workspace.slug, 'indobase')
    const roundTrip = osWorkspaceFromIdentitySession(identity)
    assert.equal(roundTrip.email, os.email)
    assert.equal(roundTrip.workspace_ref, os.workspace_ref)
    assert.doesNotMatch(JSON.stringify(identity), /PocketBase|GoTrue|Studio/i)
  })
})
