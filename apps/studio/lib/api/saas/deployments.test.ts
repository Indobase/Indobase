import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  hasValidProjectDeploymentRuntimeToken,
  isValidProjectDeploymentTransition,
  resolveProjectDeploymentRuntimeSecret,
} from './deployments'

describe('deployments', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows only forward deployment state transitions', () => {
    expect(isValidProjectDeploymentTransition('requested', 'building')).toBe(true)
    expect(isValidProjectDeploymentTransition('building', 'ready')).toBe(true)
    expect(isValidProjectDeploymentTransition('building', 'failed')).toBe(true)
    expect(isValidProjectDeploymentTransition('ready', 'archived')).toBe(true)

    expect(isValidProjectDeploymentTransition('ready', 'building')).toBe(false)
    expect(isValidProjectDeploymentTransition('failed', 'requested')).toBe(false)
    expect(isValidProjectDeploymentTransition('archived', 'ready')).toBe(false)
  })

  it('prefers a dedicated runtime secret for internal deployment auth', () => {
    vi.stubEnv('PROJECT_DEPLOYMENT_RUNTIME_SECRET', 'super-secret-runtime-token-with-at-least-32-characters')
    vi.stubEnv('BUILDER_HANDOFF_SECRET', 'super-secret-builder-token-with-at-least-32-characters')
    vi.stubEnv('AUTH_JWT_SECRET', '')
    vi.stubEnv('JWT_SECRET', '')

    expect(resolveProjectDeploymentRuntimeSecret()).toBe(
      'super-secret-runtime-token-with-at-least-32-characters'
    )
    expect(
      hasValidProjectDeploymentRuntimeToken({
        'x-indobase-deployment-token': 'super-secret-runtime-token-with-at-least-32-characters',
      })
    ).toBe(true)
    expect(
      hasValidProjectDeploymentRuntimeToken({
        'x-indobase-deployment-token': 'super-secret-builder-token-with-at-least-32-characters',
      })
    ).toBe(false)
  })

  it('falls back to the builder handoff secret when no runtime secret is configured', () => {
    vi.stubEnv('PROJECT_DEPLOYMENT_RUNTIME_SECRET', '')
    vi.stubEnv('BUILDER_HANDOFF_SECRET', 'super-secret-builder-token-with-at-least-32-characters')
    vi.stubEnv('AUTH_JWT_SECRET', '')
    vi.stubEnv('JWT_SECRET', '')

    expect(resolveProjectDeploymentRuntimeSecret()).toBe(
      'super-secret-builder-token-with-at-least-32-characters'
    )
    expect(
      hasValidProjectDeploymentRuntimeToken({
        'x-indobase-deployment-token': 'super-secret-builder-token-with-at-least-32-characters',
      })
    ).toBe(true)
    expect(
      hasValidProjectDeploymentRuntimeToken({
        'x-indobase-deployment-token': 'wrong-secret',
      })
    ).toBe(false)
  })
})
