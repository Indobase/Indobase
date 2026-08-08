import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  agentAuthStorageKey,
  deriveAgentCredentials,
  deriveAgentPassword,
  deriveAgentUsername,
} from './agent-credentials.ts'

const SECRET = 'a'.repeat(32)

describe('agent-credentials', () => {
  it('derives deterministic username and password for a principal', () => {
    const a = deriveAgentCredentials({
      handoffSecret: SECRET,
      gotrueId: 'user-aaa',
      projectRef: 'ws-1',
    })
    const b = deriveAgentCredentials({
      handoffSecret: SECRET,
      gotrueId: 'user-aaa',
      projectRef: 'ws-1',
    })
    assert.equal(a.username, b.username)
    assert.equal(a.password, b.password)
    assert.equal(a.storage_key, b.storage_key)
    assert.match(a.username, /^ib_[0-9a-f]{16}$/)
    assert.equal(a.password.length, 32)
    assert.equal(a.storage_key, 'indobase.cfos.auth.ws-1.user-aaa')
  })

  it('differs across gotrueId and projectRef', () => {
    const base = deriveAgentCredentials({
      handoffSecret: SECRET,
      gotrueId: 'user-a',
      projectRef: 'ws-1',
    })
    const otherUser = deriveAgentCredentials({
      handoffSecret: SECRET,
      gotrueId: 'user-b',
      projectRef: 'ws-1',
    })
    const otherWs = deriveAgentCredentials({
      handoffSecret: SECRET,
      gotrueId: 'user-a',
      projectRef: 'ws-2',
    })
    assert.notEqual(base.username, otherUser.username)
    assert.notEqual(base.password, otherUser.password)
    assert.notEqual(base.username, otherWs.username)
    assert.notEqual(base.password, otherWs.password)
    assert.notEqual(base.storage_key, otherUser.storage_key)
    assert.notEqual(base.storage_key, otherWs.storage_key)
  })

  it('username helper matches deriveAgentCredentials', () => {
    assert.equal(
      deriveAgentUsername('g1', 'p1'),
      deriveAgentCredentials({ handoffSecret: SECRET, gotrueId: 'g1', projectRef: 'p1' }).username,
    )
  })

  it('password changes when handoff secret changes', () => {
    const a = deriveAgentPassword(SECRET, 'g1', 'p1')
    const b = deriveAgentPassword('b'.repeat(32), 'g1', 'p1')
    assert.notEqual(a, b)
  })

  it('builds storage key', () => {
    assert.equal(agentAuthStorageKey('ref', 'gid'), 'indobase.cfos.auth.ref.gid')
  })
})
