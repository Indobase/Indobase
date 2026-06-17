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
})
