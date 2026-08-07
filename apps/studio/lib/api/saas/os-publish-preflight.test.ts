import { afterEach, describe, expect, it, vi } from 'vitest'

import { createStudioPublishPreflight } from './os-publish-preflight'

vi.mock('./os-workspace', () => ({
  getOsWorkspace: vi.fn(),
}))

vi.mock('./tenant-data-plane-provision', () => ({
  isDataPlaneProvisionerConfigured: vi.fn(),
}))

vi.mock('./tenant-public-urls', () => ({
  resolvePublicDomainForTenantStack: vi.fn(),
}))

import { getOsWorkspace } from './os-workspace'
import { isDataPlaneProvisionerConfigured } from './tenant-data-plane-provision'
import { resolvePublicDomainForTenantStack } from './tenant-public-urls'

describe('createStudioPublishPreflight', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects when workspace is missing', async () => {
    vi.mocked(getOsWorkspace).mockResolvedValue(null)
    const preflight = createStudioPublishPreflight({
      claims: { sub: 'u1', email: 'a@example.com', role: 'authenticated' } as never,
    })

    const result = await preflight.validateWorkspace({ projectRef: 'missing' })
    expect(result).toEqual({ ok: false, message: 'Workspace not found' })
  })

  it('queues os-native workspace without provisioner deploy', async () => {
    vi.mocked(getOsWorkspace).mockResolvedValue({
      ref: 'ws-1',
      name: 'Test',
      organization_slug: 'org',
      organization_id: 1,
      status: 'OS_NATIVE',
      data_plane_mode: 'os_native',
      provision_state: 'none',
    })
    vi.mocked(resolvePublicDomainForTenantStack).mockReturnValue('indobase.in')
    vi.mocked(isDataPlaneProvisionerConfigured).mockReturnValue(true)

    const preflight = createStudioPublishPreflight({
      claims: { sub: 'u1', email: 'a@example.com', role: 'authenticated' } as never,
    })
    const result = await preflight.validateWorkspace({ projectRef: 'ws-1' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.deployReady).toBe(false)
      expect(result.queuedMessage).toContain('publish URL reserved')
    }
  })

  it('marks workspace deploy-ready when provisioned and provisioner configured', async () => {
    vi.mocked(getOsWorkspace).mockResolvedValue({
      ref: 'ws-2',
      name: 'Ready',
      organization_slug: 'org',
      organization_id: 1,
      status: 'ACTIVE_HEALTHY',
      data_plane_mode: 'isolated_stack',
      provision_state: 'ready',
    })
    vi.mocked(resolvePublicDomainForTenantStack).mockReturnValue('indobase.in')
    vi.mocked(isDataPlaneProvisionerConfigured).mockReturnValue(true)

    const preflight = createStudioPublishPreflight({
      claims: { sub: 'u1', email: 'a@example.com', role: 'authenticated' } as never,
    })
    const result = await preflight.validateWorkspace({ projectRef: 'ws-2' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.deployReady).toBe(true)
      expect(result.hostDomain).toBe('indobase.in')
    }
  })
})
