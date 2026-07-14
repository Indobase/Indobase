import { describe, expect, it } from 'vitest'

import { IS_SAAS } from 'lib/constants'

import { isProjectDatabaseReady, isProjectPlatformApiReady, projectNeedsDedicatedDatabase } from './project-runtime'

describe('project-runtime', () => {
  it('allows SQL when project is ACTIVE_HEALTHY', () => {
    expect(isProjectDatabaseReady({ status: 'ACTIVE_HEALTHY' })).toBe(true)
  })

  it('refuses SQL for SaaS projects stuck on the shared control-plane DB', () => {
    if (!IS_SAAS) return
    expect(
      isProjectDatabaseReady({
        status: 'ACTIVE_HEALTHY',
        hasDedicatedDatabase: false,
      })
    ).toBe(false)
  })

  it('allows SQL for SaaS projects with a dedicated connection while COMING_UP', () => {
    if (!IS_SAAS) return
    expect(
      isProjectDatabaseReady({
        status: 'COMING_UP',
        connectionString: 'enc-connection',
        hasDedicatedDatabase: true,
      })
    ).toBe(true)
  })

  it('enables platform APIs for SaaS regardless of status', () => {
    if (!IS_SAAS) return
    expect(isProjectPlatformApiReady({ status: 'COMING_UP' })).toBe(true)
  })

  it('detects legacy shared-database projects', () => {
    if (!IS_SAAS) return
    expect(projectNeedsDedicatedDatabase({ hasDedicatedDatabase: false, status: 'ACTIVE_HEALTHY' })).toBe(
      true
    )
    expect(projectNeedsDedicatedDatabase({ hasDedicatedDatabase: true, status: 'ACTIVE_HEALTHY' })).toBe(
      false
    )
  })
})
