import { describe, expect, it } from 'vitest'

import { resolveProductImages } from './product-images'

describe('product-images', () => {
  it('requires at least one query', async () => {
    const result = await resolveProductImages({ queries: ['  ', ''] })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('query_required')
    expect(result.images).toEqual([])
  })
})
