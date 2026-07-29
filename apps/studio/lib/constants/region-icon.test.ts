import { describe, expect, it } from 'vitest'

import { INDIA_REGION_DEFAULT } from 'lib/constants/india-regions'
import { regionIconSrc, resolveRegionDisplay, resolveRegionIconCode } from './region-icon'

describe('region-icon', () => {
  it('maps Chennai display name to in-chennai slug', () => {
    expect(resolveRegionIconCode('Chennai')).toBe('in-chennai')
    expect(regionIconSrc('Chennai')).toContain('/img/regions/in-chennai.svg')
  })

  it('falls back when region is missing', () => {
    expect(resolveRegionIconCode(undefined)).toBe(INDIA_REGION_DEFAULT.code)
    expect(resolveRegionIconCode('')).toBe(INDIA_REGION_DEFAULT.code)
  })

  it('resolveRegionDisplay always includes region code', () => {
    expect(resolveRegionDisplay('Chennai')).toEqual({
      name: 'Chennai',
      region: 'in-chennai',
    })
    expect(resolveRegionDisplay(undefined).region).toBeTruthy()
  })
})
