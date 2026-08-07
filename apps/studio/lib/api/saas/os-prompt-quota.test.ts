import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./os-workspace', () => ({
  getOsWorkspace: vi.fn(),
}))

vi.mock('./builder-prompt-quota', () => ({
  getBuilderPromptQuota: vi.fn(),
  consumeBuilderPrompt: vi.fn(),
}))

import { getOsWorkspace } from './os-workspace'
import { consumeBuilderPrompt, getBuilderPromptQuota } from './builder-prompt-quota'
import { consumeOsPromptQuota, getOsPromptQuota } from './os-prompt-quota'

const claims = { sub: 'user-1', email: 'ada@indobase.in', role: 'authenticated' } as const

describe('os-prompt-quota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when workspace is missing', async () => {
    vi.mocked(getOsWorkspace).mockResolvedValue(null)
    expect(await getOsPromptQuota({ claims: claims as any, workspaceRef: 'missing' })).toBeNull()
  })

  it('loads Builder prompt quota for the workspace org', async () => {
    vi.mocked(getOsWorkspace).mockResolvedValue({
      ref: 'ws-1',
      name: 'Ada',
      organization_slug: 'ada-co',
      organization_id: 1,
      status: 'OS_NATIVE',
      data_plane_mode: 'os_native',
      provision_state: 'none',
    })
    vi.mocked(getBuilderPromptQuota).mockResolvedValue({
      plan: 'free',
      used: 2,
      limit: 5,
      remaining: 3,
      isFree: true,
    })

    const quota = await getOsPromptQuota({ claims: claims as any, workspaceRef: 'ws-1' })
    expect(quota).toMatchObject({
      organization_slug: 'ada-co',
      used: 2,
      remaining: 3,
      upgradeUrl: '/org/ada-co/billing?panel=subscriptionPlan',
    })
  })

  it('consumes a prompt and surfaces free-limit block', async () => {
    vi.mocked(getOsWorkspace).mockResolvedValue({
      ref: 'ws-1',
      name: 'Ada',
      organization_slug: 'ada-co',
      organization_id: 1,
      status: 'OS_NATIVE',
      data_plane_mode: 'os_native',
      provision_state: 'none',
    })
    vi.mocked(consumeBuilderPrompt).mockResolvedValue({
      ok: false,
      quota: { plan: 'free', used: 5, limit: 5, remaining: 0, isFree: true },
      upgradeUrl: '/org/ada-co/billing?panel=subscriptionPlan',
    })

    const result = await consumeOsPromptQuota({ claims: claims as any, workspaceRef: 'ws-1' })
    expect(result.ok).toBe(false)
    if (result.ok || 'notFound' in result) return
    expect(result.message).toMatch(/Free agent limit/i)
    expect(result.quota.remaining).toBe(0)
  })
})
