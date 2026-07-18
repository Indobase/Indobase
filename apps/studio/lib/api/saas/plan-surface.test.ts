import { describe, expect, it } from 'vitest'

import { PLATFORM_ADMIN_ALLOWED_PLANS } from './platform-admin'
import { SAAS_CONTROL_PLANE_PLAN_CONSTRAINT_SQL } from './controlPlanePlanConstraintSql'

describe('plan surface consistency', () => {
  it('allows every current paid tier in platform admin', () => {
    expect(PLATFORM_ADMIN_ALLOWED_PLANS).toEqual(
      new Set(['free', 'basic', 'pro', 'studio', 'team', 'enterprise', 'platform'])
    )
  })

  it('repairs legacy database constraints to accept Basic and Studio', () => {
    expect(SAAS_CONTROL_PLANE_PLAN_CONSTRAINT_SQL).toContain('drop constraint if exists organizations_plan_check')
    expect(SAAS_CONTROL_PLANE_PLAN_CONSTRAINT_SQL).toContain("'basic'")
    expect(SAAS_CONTROL_PLANE_PLAN_CONSTRAINT_SQL).toContain("'studio'")
  })
})
