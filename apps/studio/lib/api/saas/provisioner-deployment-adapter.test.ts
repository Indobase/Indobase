import { afterEach, describe, expect, it, vi } from 'vitest'

import { createProvisionerDeploymentAdapter } from './provisioner-deployment-adapter'

vi.mock('./tenant-data-plane-provision', () => ({
  ensureTenantSiteHosting: vi.fn(),
}))

vi.mock('./deployments', () => ({
  updateProjectDeployment: vi.fn(),
}))

import { ensureTenantSiteHosting } from './tenant-data-plane-provision'
import { updateProjectDeployment } from './deployments'

describe('provisioner-deployment-adapter', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deploy calls ensureTenantSiteHosting for the project ref', async () => {
    vi.mocked(ensureTenantSiteHosting).mockResolvedValue({
      ok: true,
      provisioner_status: 200,
    })

    const adapter = createProvisionerDeploymentAdapter()
    await adapter.deploy({
      executionId: 'exec_test' as never,
      projectRef: 'my-workspace-ref',
      payload: { artifactRef: 'sites/abc' },
    })

    expect(ensureTenantSiteHosting).toHaveBeenCalledWith('my-workspace-ref')
  })

  it('assignDomain returns https ref.indobase.in live URL', async () => {
    const adapter = createProvisionerDeploymentAdapter()
    const assignment = await adapter.assignDomain(
      {
        executionId: 'exec_test' as never,
        projectRef: 'my-workspace-ref',
      },
      'indobase.in',
    )

    expect(assignment.liveUrl).toBe('https://my-workspace-ref.indobase.in')
  })

  it('healthCheck probes live URL and reports unhealthy on failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('timeout'))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = createProvisionerDeploymentAdapter()
    const probe = await adapter.healthCheck(
      { executionId: 'exec_test' as never, projectRef: 'ref' },
      'https://ref.indobase.in',
    )

    expect(probe.healthy).toBe(false)
    expect(probe.details?.message).toMatch(/couldn't confirm your site is live/i)
    vi.unstubAllGlobals()
  })

  it('rollback is best-effort metadata update when deploymentId present', async () => {
    vi.mocked(updateProjectDeployment).mockResolvedValue({} as never)
    const adapter = createProvisionerDeploymentAdapter()
    const ctx = {
      executionId: 'exec_test' as never,
      projectRef: 'ref',
      payload: { deploymentId: 'dep-1' },
    }

    await expect(adapter.provisionTLS(ctx, 'indobase.in')).resolves.toBeUndefined()
    await expect(adapter.rollback(ctx, 'health failed')).resolves.toBeUndefined()
    expect(updateProjectDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: 'dep-1',
        ref: 'ref',
        logMessage: 'Launch rolled back after publish failure',
      }),
    )
  })

  it('rollback is a documented no-op without deploymentId', async () => {
    const adapter = createProvisionerDeploymentAdapter()
    await expect(
      adapter.rollback({ executionId: 'exec_test' as never, projectRef: 'ref' }, 'x'),
    ).resolves.toBeUndefined()
    expect(updateProjectDeployment).not.toHaveBeenCalled()
  })
})
