import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import type { Context } from 'hono'

import {
  backendFromEnsureResult,
  backendConfigFromGuidedSnapshot,
  syncBackendAfterEnsure,
} from './backend-session-sync.ts'
import { lookupAgentPrincipal, rememberAgentPrincipal } from './agent-principal-store.ts'

describe('backend-session-sync', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
      dir = ''
    }
    delete process.env.INDOBASE_AGENT_PRINCIPAL_DIR
  })

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

  it('backendConfigFromGuidedSnapshot uses records ABI for managed public key', () => {
    const cfg = backendConfigFromGuidedSnapshot(
      { api_url: 'https://backend.indobase.in', anon_key: 'public', project_ref: 'abc' },
      { projectRef: 'abc', projectName: 'App' },
    )
    assert.equal(cfg.auth_url, 'https://backend.indobase.in/api/collections/users')
    assert.equal(cfg.rest_url, 'https://backend.indobase.in/api/collections')
    assert.equal(cfg.public_env?.INDOBASE_BACKEND_KIND, 'records')
  })

  it('syncBackendAfterEnsure stashes backend on agent principal from tool headers', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ib-sync-'))
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR = dir
    await rememberAgentPrincipal({
      username: 'ib_sync_tool',
      gotrueId: 'user-sync',
      projectRef: 'ws-sync',
      email: 'sync@example.com',
      guest: false,
    })
    const headers = new Map<string, string>([['x-indobase-agent-username', 'ib_sync_tool']])
    const c = {
      req: {
        header: (name: string) => headers.get(name.toLowerCase()) || '',
      },
      header: () => {},
    } as unknown as Context
    const backend = {
      api_url: 'https://backend.indobase.in',
      anon_key: 'public',
      auth_url: 'https://backend.indobase.in/api/collections/users',
      rest_url: 'https://backend.indobase.in/api/collections',
      storage_url: 'https://backend.indobase.in/api/files',
      project_ref: 'ws-sync',
      project_name: 'Sync',
      project_url: 'https://backend.indobase.in',
    }
    await syncBackendAfterEnsure(c, null, { ok: true, backend })
    const found = await lookupAgentPrincipal('ib_sync_tool')
    assert.equal(found?.backend?.api_url, 'https://backend.indobase.in')
    assert.equal(found?.backend?.anon_key, 'public')
  })
})
