import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./query', () => ({
  executeQuery: vi.fn(),
}))

vi.mock('./platform', () => ({
  getTenantStackArtifacts: vi.fn(),
  recordDataPlaneProvisionFailure: vi.fn(),
  recordDataPlaneProvisionResultForSystem: vi.fn(),
  recordDataPlaneProvisionSuccess: vi.fn(),
  resolvePublicDomainForTenantStack: vi.fn(),
}))

vi.mock('./tenant-data-plane-health', () => ({
  isTenantDataPlaneReachable: vi.fn(),
}))

vi.mock('./tenant-compose-validation', () => ({
  repairKnownTenantComposeYaml: vi.fn(),
}))

const { executeQuery } = await import('./query')
const { repairUnhealthyTenantDataPlaneStacks } = await import('./tenant-data-plane-provision')

describe('repairUnhealthyTenantDataPlaneStacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATA_PLANE_PROVISIONER_URL = 'http://provisioner.local'
    process.env.DATA_PLANE_PROVISIONER_TOKEN = 'test-token'
  })

  it('orders candidates by provision/inserted timestamps, not saas.projects.updated_at', async () => {
    vi.mocked(executeQuery).mockResolvedValue({ data: [], error: null } as any)

    await repairUnhealthyTenantDataPlaneStacks({ fleetPass: false, limit: 5 })

    expect(executeQuery).toHaveBeenCalledTimes(1)
    const query = String(vi.mocked(executeQuery).mock.calls[0]?.[0]?.query ?? '')
    expect(query).not.toMatch(/p\.updated_at/)
    expect(query).toMatch(
      /coalesce\(\s*p\.data_plane_last_provisioned_at\s*,\s*p\.inserted_at\s*\)\s+desc\s+nulls\s+last/i
    )
  })
})
