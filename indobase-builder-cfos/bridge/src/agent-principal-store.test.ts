import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import {
  lookupAgentPrincipal,
  reconcileAgentPrincipal,
  rememberAgentPrincipal,
} from './agent-principal-store.ts'

describe('agent-principal-store', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
      dir = ''
    }
    delete process.env.INDOBASE_AGENT_PRINCIPAL_DIR
  })

  it('remembers and looks up a principal by CFOS username', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-principals-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir

    await rememberAgentPrincipal({
      username: 'ib_abc123def4567890',
      gotrueId: 'user-1',
      projectRef: 'ws-sprout',
      email: 'owner@example.com',
      guest: false,
      projectName: 'SproutEats',
    })

    const found = await lookupAgentPrincipal('ib_abc123def4567890')
    assert.ok(found)
    assert.equal(found.projectRef, 'ws-sprout')
    assert.equal(found.gotrueId, 'user-1')
    assert.equal(found.guest, false)
    assert.equal(found.projectName, 'SproutEats')
    assert.ok(found.updatedAt)
  })

  it('returns null for unknown usernames', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-principals-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir
    assert.equal(await lookupAgentPrincipal('ib_missing'), null)
  })

  it('does not downgrade a member principal back to guest for the same username', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-principals-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir
    await rememberAgentPrincipal({
      username: 'ib_same',
      gotrueId: 'user-real',
      projectRef: 'ws-1',
      email: 'a@x.com',
      guest: false,
    })
    await rememberAgentPrincipal({
      username: 'ib_same',
      gotrueId: 'guest_abc',
      projectRef: 'draft_1',
      email: '',
      guest: true,
    })
    const found = await lookupAgentPrincipal('ib_same')
    assert.equal(found?.guest, false)
    assert.equal(found?.email, 'a@x.com')
    assert.equal(found?.gotrueId, 'user-real')
  })

  it('overwrites the same username', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-principals-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir
    await rememberAgentPrincipal({
      username: 'ib_same',
      gotrueId: 'g1',
      projectRef: 'ws-1',
      email: 'a@x.com',
      guest: true,
    })
    await rememberAgentPrincipal({
      username: 'ib_same',
      gotrueId: 'g1',
      projectRef: 'ws-1',
      email: 'a@x.com',
      guest: false,
    })
    const found = await lookupAgentPrincipal('ib_same')
    assert.equal(found?.guest, false)
  })

  it('preserves backend snapshot across remember refreshes', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-principals-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir
    await rememberAgentPrincipal({
      username: 'ib_backend',
      gotrueId: 'user-1',
      projectRef: 'ws-1',
      email: 'a@x.com',
      guest: false,
    })
    const { updateAgentPrincipalBackend } = await import('./agent-principal-store.ts')
    await updateAgentPrincipalBackend('ib_backend', {
      api_url: 'https://backend.indobase.in',
      anon_key: 'public',
      auth_url: 'https://backend.indobase.in/api/collections/users',
      rest_url: 'https://backend.indobase.in/api/collections',
      storage_url: 'https://backend.indobase.in/api/files',
      project_ref: 'ws-1',
      project_name: 'Workspace',
      project_url: 'https://backend.indobase.in',
    })
    await rememberAgentPrincipal({
      username: 'ib_backend',
      gotrueId: 'user-1',
      projectRef: 'ws-1',
      email: 'a@x.com',
      guest: false,
    })
    const found = await lookupAgentPrincipal('ib_backend')
    assert.equal(found?.backend?.api_url, 'https://backend.indobase.in')
    assert.equal(found?.backend?.anon_key, 'public')
  })

  it('ignores remembers with empty projectRef', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-principals-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir
    await rememberAgentPrincipal({
      username: 'ib_empty',
      gotrueId: 'user-1',
      projectRef: '   ',
      email: 'a@x.com',
      guest: false,
    })
    assert.equal(await lookupAgentPrincipal('ib_empty'), null)
  })

  it('updateAgentPrincipalBackend stores api_url and anon_key', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-principals-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir
    await rememberAgentPrincipal({
      username: 'ib_backend',
      gotrueId: 'user-1',
      projectRef: 'ws-1',
      email: 'a@x.com',
      guest: false,
    })
    const { updateAgentPrincipalBackend } = await import('./agent-principal-store.ts')
    await updateAgentPrincipalBackend('ib_backend', {
      api_url: 'https://ws-1.indobase.in',
      anon_key: 'anon',
      auth_url: 'https://ws-1.indobase.in/auth/v1',
      rest_url: 'https://ws-1.indobase.in/rest/v1/',
      storage_url: 'https://ws-1.indobase.in/storage/v1',
      project_ref: 'ws-1',
      project_name: 'Workspace',
      project_url: 'https://studio.indobase.in/project/ws-1/backend',
    })
    const found = await lookupAgentPrincipal('ib_backend')
    assert.equal(found?.backend?.api_url, 'https://ws-1.indobase.in')
    assert.equal(found?.backend?.anon_key, 'anon')
  })

  it('rehydrateSessionBackend merges principal snapshot when cookie lacks backend', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-principals-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir
    const { deriveAgentUsername } = await import('./agent-credentials.ts')
    const gotrueId = 'user-rehydrate'
    const projectRef = 'ws-rehydrate'
    const username = deriveAgentUsername(gotrueId, projectRef)
    await rememberAgentPrincipal({
      username,
      gotrueId,
      projectRef,
      email: 're@example.com',
      guest: false,
      backend: {
        api_url: 'https://backend.indobase.in',
        anon_key: 'public',
        auth_url: 'https://backend.indobase.in/api/collections/users',
        rest_url: 'https://backend.indobase.in/api/collections',
        storage_url: 'https://backend.indobase.in/api/files',
        project_ref: projectRef,
        project_name: 'Rehydrate',
      },
    })
    const { rehydrateSessionBackend } = await import('./agent-principal-store.ts')
    const hydrated = await rehydrateSessionBackend({
      gotrueId,
      projectRef,
      backend: undefined,
    })
    assert.equal(hydrated.backend?.api_url, 'https://backend.indobase.in')
    assert.equal(hydrated.backend?.anon_key, 'public')
  })

  it('reconcileAgentPrincipal prefers the member principal for the same workspace', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-principals-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir
    await rememberAgentPrincipal({
      username: 'ib_guest_old',
      gotrueId: 'guest_abc',
      projectRef: 'roshfdaaf13e89',
      email: '',
      guest: true,
    })
    await rememberAgentPrincipal({
      username: 'ib_member_new',
      gotrueId: 'user-real',
      projectRef: 'roshfdaaf13e89',
      email: 'op@indobase.in',
      guest: false,
    })
    const reconciled = await reconcileAgentPrincipal('ib_guest_old')
    assert.equal(reconciled?.guest, false)
    assert.equal(reconciled?.email, 'op@indobase.in')
    assert.equal(reconciled?.projectRef, 'roshfdaaf13e89')
    assert.equal(reconciled?.gotrueId, 'user-real')
  })
})
