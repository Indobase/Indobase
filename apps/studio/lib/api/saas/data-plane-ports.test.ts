import { describe, expect, it } from 'vitest'

import {
  computeDataPlanePortBase,
  dataPlanePortBasesCollide,
  isDataPlanePortBaseAvailable,
  resolveDataPlanePortBase,
} from './data-plane-ports'

describe('data-plane-ports', () => {
  it('detects overlapping port blocks', () => {
    expect(dataPlanePortBasesCollide(12000, 12003)).toBe(true)
    expect(dataPlanePortBasesCollide(12000, 12007)).toBe(true)
    expect(dataPlanePortBasesCollide(12000, 12008)).toBe(false)
  })

  it('probes for a non-colliding base when the hash collides', () => {
    const preferred = computeDataPlanePortBase('project-b')
    const occupied = [preferred]
    const resolved = resolveDataPlanePortBase('project-b', occupied)
    expect(isDataPlanePortBaseAvailable(resolved, occupied)).toBe(true)
    expect(resolved).not.toBe(preferred)
  })
})
