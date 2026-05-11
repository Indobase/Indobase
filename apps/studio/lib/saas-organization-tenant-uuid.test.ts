import { describe, expect, it } from 'vitest'

import { saasOrganizationIdToTenantUuid, SAAS_ORG_TENANT_UUID_NAMESPACE } from './saas-organization-tenant-uuid'

describe('saasOrganizationIdToTenantUuid', () => {
  it('returns a stable uuid v5 for the same organization id', () => {
    expect(saasOrganizationIdToTenantUuid(1)).toBe(saasOrganizationIdToTenantUuid(1))
    expect(saasOrganizationIdToTenantUuid(1)).not.toBe(saasOrganizationIdToTenantUuid(2))
  })

  it('uses the documented namespace', () => {
    expect(SAAS_ORG_TENANT_UUID_NAMESPACE).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })
})
