import { describe, expect, it } from 'vitest'

import { assertOsEnsureAccess } from './os-ensurer-access'

describe('assertOsEnsureAccess', () => {
  it('rejects guest gotrue ids', () => {
    const result = assertOsEnsureAccess({
      gotrueId: 'guest_abc123',
      workspaceRef: 'acme-workspace',
      plan: 'pro',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('account_required')
    expect(result.statusCode).toBe(403)
    expect(result.message).toMatch(/account/i)
  })

  it('rejects draft_* workspace refs', () => {
    const result = assertOsEnsureAccess({
      gotrueId: 'user-1',
      workspaceRef: 'draft_deadbeef',
      plan: 'pro',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('account_required')
  })

  it('rejects Free plan without backendStudio', () => {
    const result = assertOsEnsureAccess({
      gotrueId: 'user-1',
      workspaceRef: 'acme-ws',
      plan: 'free',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('plan_required')
    expect(result.statusCode).toBe(403)
  })

  it('allows Basic+ signed-in workspaces', () => {
    expect(
      assertOsEnsureAccess({ gotrueId: 'user-1', workspaceRef: 'acme-ws', plan: 'basic' }).ok,
    ).toBe(true)
    expect(
      assertOsEnsureAccess({ gotrueId: 'user-1', workspaceRef: 'acme-ws', plan: 'pro' }).ok,
    ).toBe(true)
    expect(
      assertOsEnsureAccess({ gotrueId: 'user-1', workspaceRef: 'acme-ws', plan: 'studio' }).ok,
    ).toBe(true)
  })

  it('treats missing plan as free (blocked)', () => {
    const result = assertOsEnsureAccess({
      gotrueId: 'user-1',
      workspaceRef: 'acme-ws',
      plan: null,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('plan_required')
  })
})
