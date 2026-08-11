import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  OS_ACCOUNT_REQUIRED_PATHS,
  OS_GUEST_ALLOWED_READ_PATHS,
  accountRequiredBody,
  pathAllowsGuestRead,
  pathRequiresSignedInAccount,
} from './guest-gates.ts'
import { createGuestSession, isGuestSession } from './auth.ts'

describe('guest gates', () => {
  it('marks guest sessions by empty email, guest_ id, draft_ ref, or guest org', () => {
    const guest = createGuestSession()
    assert.equal(isGuestSession(guest), true)
    assert.ok(guest.gotrueId.startsWith('guest_'))
    assert.ok(guest.projectRef.startsWith('draft_'))
    assert.equal(guest.orgSlug, 'guest')
    assert.equal(guest.email, '')

    assert.equal(
      isGuestSession({
        gotrueId: 'user-1',
        email: 'ada@indobase.in',
        projectRef: 'ws-1',
        orgSlug: 'ada',
        projectName: 'Ada',
        studioUrl: '',
      }),
      false,
    )
  })

  it('requires account for Launch / Ensure / mutate paths', () => {
    for (const path of OS_ACCOUNT_REQUIRED_PATHS) {
      assert.equal(pathRequiresSignedInAccount(path), true, path)
    }
    assert.equal(pathRequiresSignedInAccount('/api/os/launch/status'), false)
    assert.equal(pathAllowsGuestRead('/api/os/launch/status'), true)
    assert.equal(pathAllowsGuestRead('/api/session'), true)
    assert.equal(pathAllowsGuestRead('/api/os/runtime/agent-credentials'), true)
    assert.equal(pathAllowsGuestRead('/api/os/runtime/session-status'), true)
    assert.equal(pathAllowsGuestRead('/auth/start'), true)
    assert.equal(pathAllowsGuestRead('/auth/verify'), true)
    // begin-turn allows guests (no consume) so OTP signup chat is not blocked
    assert.equal(pathRequiresSignedInAccount('/api/os/agent/begin-turn'), false)
    assert.equal(pathAllowsGuestRead('/api/os/agent/begin-turn'), true)
    assert.ok(OS_ACCOUNT_REQUIRED_PATHS.includes('/api/os/usage/prompt-quota'))
    assert.ok(OS_ACCOUNT_REQUIRED_PATHS.includes('/api/os/auth/mail'))
    assert.ok(OS_ACCOUNT_REQUIRED_PATHS.includes('/api/os/tools/launchBusiness'))
    assert.ok(OS_ACCOUNT_REQUIRED_PATHS.includes('/api/os/tools/connectGateway'))
    assert.ok(OS_ACCOUNT_REQUIRED_PATHS.includes('/api/os/tools/ensureLogin'))
  })

  it('accountRequiredBody points operators at Create account / chat verify', () => {
    const body = accountRequiredBody()
    assert.equal(body.code, 'account_required')
    assert.match(body.message, /Create your Indobase account/)
  })
})
