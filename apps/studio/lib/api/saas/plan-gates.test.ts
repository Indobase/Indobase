import { afterEach, describe, expect, it } from 'vitest'

import {
  PLAN_GATES_ENABLED_DEFAULT,
  arePlanGatesBypassed,
  arePlanGatesEnabled,
} from './plan-gates'

describe('plan-gates', () => {
  const envKeys = [
    'INDOBASE_PLAN_GATES_ENABLED',
    'NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED',
  ] as const
  const previous: Record<string, string | undefined> = {}

  afterEach(() => {
    for (const key of envKeys) {
      if (key in previous) {
        const value = previous[key]
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
        delete previous[key]
      }
    }
  })

  function setEnv(key: (typeof envKeys)[number], value: string | undefined) {
    if (!(key in previous)) previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  it('defaults to gates off for go-live', () => {
    setEnv('INDOBASE_PLAN_GATES_ENABLED', undefined)
    setEnv('NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED', undefined)
    expect(PLAN_GATES_ENABLED_DEFAULT).toBe(false)
    expect(arePlanGatesEnabled()).toBe(false)
    expect(arePlanGatesBypassed()).toBe(true)
  })

  it('can re-enable via INDOBASE_PLAN_GATES_ENABLED', () => {
    setEnv('NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED', undefined)
    setEnv('INDOBASE_PLAN_GATES_ENABLED', 'true')
    expect(arePlanGatesEnabled()).toBe(true)
    expect(arePlanGatesBypassed()).toBe(false)
  })

  it('can force off via env even if someone flips the default later', () => {
    setEnv('INDOBASE_PLAN_GATES_ENABLED', 'false')
    expect(arePlanGatesEnabled()).toBe(false)
  })

  it('prefers NEXT_PUBLIC over server-only env', () => {
    setEnv('INDOBASE_PLAN_GATES_ENABLED', 'true')
    setEnv('NEXT_PUBLIC_INDOBASE_PLAN_GATES_ENABLED', 'false')
    expect(arePlanGatesEnabled()).toBe(false)
  })
})
