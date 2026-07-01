import { describe, expect, it } from 'vitest'

import {
  assertValidTenantComposeYaml,
  repairKnownTenantComposeYaml,
} from './tenant-compose-validation'

describe('tenant-compose-validation', () => {
  it('rejects broken Google redirect YAML', () => {
    const bad = `services:
  tenant-auth:
    environment:
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: 'https://ref.indobase.in'/auth/v1/callback
  tenant-rest:
    image: postgrest/postgrest:v14.5
`
    expect(() => assertValidTenantComposeYaml(bad)).toThrow(/GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI/)
  })

  it('repairs broken Google redirect YAML', () => {
    const bad = `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: 'https://ref.indobase.in'/auth/v1/callback`
    const fixed = repairKnownTenantComposeYaml(bad)
    expect(fixed).toContain("'https://ref.indobase.in/auth/v1/callback'")
    expect(() =>
      assertValidTenantComposeYaml(`tenant-rest:\n  x: 1\ntenant-auth:\n  y: ${fixed}`)
    ).not.toThrow()
  })

  it('repairs dual-VPS network and postgres host when remote data plane is configured', () => {
    const prevProvisioner = process.env.DATA_PLANE_PROVISIONER_URL
    process.env.DATA_PLANE_PROVISIONER_URL = 'http://103.190.92.248:8787'

    const broken = `networks:
  tenant_data_plane:
    external: true
    name: indobase_default
services:
  tenant-auth:
    environment:
      GOTRUE_DB_DATABASE_URL: 'postgresql://supabase_auth_admin:pw@indobase-db:5432/tenantdb_x'
  tenant-rest:
    environment:
      PGRST_DB_URI: 'postgresql://authenticator:pw@indobase-db:5432/tenantdb_x'
  tenant-realtime:
    environment:
      DB_HOST: 'indobase-db'
      DB_PORT: '5432'
`

    const fixed = repairKnownTenantComposeYaml(broken)
    expect(fixed).toContain('name: indobase-backend-bmqhan_default')
    expect(fixed).toContain('@103.190.92.249:5433')
    expect(fixed).toContain("DB_HOST: '103.190.92.249'")
    expect(fixed).toContain("DB_PORT: '5433'")

    process.env.DATA_PLANE_PROVISIONER_URL = prevProvisioner
  })

  it('repairs realtime DB_PORT when host is already the remote bridge', () => {
    const prevProvisioner = process.env.DATA_PLANE_PROVISIONER_URL
    process.env.DATA_PLANE_PROVISIONER_URL = 'http://103.190.92.248:8787'

    const broken = `tenant-rest:
  x: 1
tenant-auth:
  y: 1
tenant-realtime:
  environment:
    DB_HOST: '103.190.92.249'
    DB_PORT: '5432'
`

    const fixed = repairKnownTenantComposeYaml(broken)
    expect(fixed).toContain("DB_HOST: '103.190.92.249'")
    expect(fixed).toContain("DB_PORT: '5433'")

    process.env.DATA_PLANE_PROVISIONER_URL = prevProvisioner
  })
})
