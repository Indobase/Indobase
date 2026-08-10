import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import {
  BROWSER_PENDING_CLAIM_KEY,
  rememberPendingSession,
  takePendingSession,
  takePendingSessionForClaim,
} from './pending-session-store.ts'

describe('pending-session-store', () => {
  let dir = ''
  const prev = process.env.INDOBASE_LAUNCH_ROOT

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ib-pending-'))
    process.env.INDOBASE_LAUNCH_ROOT = dir
  })

  after(async () => {
    if (prev === undefined) delete process.env.INDOBASE_LAUNCH_ROOT
    else process.env.INDOBASE_LAUNCH_ROOT = prev
    await rm(dir, { recursive: true, force: true })
  })

  it('mirrors pending under browser claim alias', async () => {
    await rememberPendingSession({
      username: 'ib_agent_abc',
      sessionToken: 'tok-1',
      email: 'a@example.com',
      projectRef: 'proj-1',
    })
    const viaAlias = await takePendingSession(BROWSER_PENDING_CLAIM_KEY)
    assert.ok(viaAlias)
    assert.equal(viaAlias.sessionToken, 'tok-1')
    assert.equal(await takePendingSession('ib_agent_abc'), null)
  })

  it('takePendingSessionForClaim finds alias when agent username drifts', async () => {
    await rememberPendingSession({
      username: 'dev',
      sessionToken: 'tok-2',
      email: 'b@example.com',
      projectRef: 'proj-2',
    })
    const found = await takePendingSessionForClaim(['ib_cookie_derived', 'other'])
    assert.ok(found)
    assert.equal(found.sessionToken, 'tok-2')
  })
})
