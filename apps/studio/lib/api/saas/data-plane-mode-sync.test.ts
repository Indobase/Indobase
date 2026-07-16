import { describe, expect, it } from 'vitest'

import { describeDataPlaneTransition } from './data-plane-mode-sync'
import { resolveDataPlaneModeForPlan } from './data-plane-mode'

describe('data-plane-mode-sync', () => {
  it('describeDataPlaneTransition labels upgrade and downgrade paths', () => {
    expect(describeDataPlaneTransition('shared_gateway', 'isolated_stack')).toBe(
      'shared_gateway_to_isolated_traefik'
    )
    expect(describeDataPlaneTransition('isolated_stack', 'shared_gateway')).toBe(
      'isolated_traefik_to_shared_gateway'
    )
    expect(describeDataPlaneTransition('isolated_stack', 'isolated_stack')).toBe('unchanged')
  })

  it('resolveDataPlaneModeForPlan aligns with sync targets', () => {
    expect(resolveDataPlaneModeForPlan('free')).toBe('shared_gateway')
    expect(resolveDataPlaneModeForPlan('pro')).toBe('isolated_stack')
  })
})
