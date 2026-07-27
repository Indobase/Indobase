import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./query', () => ({
  executeQuery: vi.fn(),
}))

vi.mock('./plan-entitlements', () => ({
  getPlanEntitlements: vi.fn((planId: string) => {
    if (planId === 'free') return { idleSleepDays: 7, canPinProject: false }
    if (planId === 'basic' || planId === 'pro') return { idleSleepDays: 30, canPinProject: planId === 'pro' }
    return { idleSleepDays: null, canPinProject: true }
  }),
}))

const { executeQuery } = await import('./query')
const { pauseIdleProjects } = await import('./plan-lifecycle')

describe('pauseIdleProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses real saas.projects timestamps, not updated_at', async () => {
    vi.mocked(executeQuery).mockResolvedValue({ data: [], error: null } as any)

    await pauseIdleProjects({ dryRun: true, limit: 5 })

    expect(executeQuery.mock.calls.length).toBeGreaterThan(0)
    for (const call of vi.mocked(executeQuery).mock.calls) {
      const query = String(call[0]?.query ?? '')
      expect(query).not.toMatch(/\bp\.updated_at\b/)
      expect(query).not.toMatch(/\bupdated_at\s*=\s*now\(\)/)
      expect(query).toMatch(/coalesce\(\s*p\.data_plane_last_provisioned_at\s*,\s*p\.inserted_at\s*\)/i)
    }
  })

  it('pause update omits saas.projects.updated_at', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        data: [{ ref: 'abc123', organization_slug: 'org', last_activity_at: '2020-01-01' }],
        error: null,
      } as any)
      .mockResolvedValue({ data: [], error: null } as any)

    await pauseIdleProjects({ dryRun: false, limit: 1 })

    const updateCall = vi.mocked(executeQuery).mock.calls.find((call) =>
      String(call[0]?.query ?? '').includes('update saas.projects')
    )
    expect(updateCall).toBeTruthy()
    const updateQuery = String(updateCall?.[0]?.query ?? '')
    expect(updateQuery).not.toMatch(/\bupdated_at\b/)
    expect(updateQuery).toMatch(/pause_reason\s*=\s*\$2/)
  })
})
