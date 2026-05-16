import { describe, expect, it } from 'vitest'

import { parseRevealQuery } from './project-api-keys'

describe('project-api-keys', () => {
  it('parseRevealQuery treats only "true" as true', () => {
    expect(parseRevealQuery('true')).toBe(true)
    expect(parseRevealQuery('false')).toBe(false)
    expect(parseRevealQuery(undefined)).toBe(false)
  })
})
