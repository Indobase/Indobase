import { describe, expect, it } from 'vitest'

import { getPublicBuilderUrl } from 'lib/constants/builder-url'

describe('getPublicBuilderUrl', () => {
  it('defaults to classic builder.indobase.in', () => {
    const prev = process.env.NEXT_PUBLIC_BUILDER_APP_URL
    delete process.env.NEXT_PUBLIC_BUILDER_APP_URL
    expect(getPublicBuilderUrl()).toBe('https://builder.indobase.in')
    if (prev !== undefined) process.env.NEXT_PUBLIC_BUILDER_APP_URL = prev
  })

  it('uses NEXT_PUBLIC_BUILDER_APP_URL when set', () => {
    const prev = process.env.NEXT_PUBLIC_BUILDER_APP_URL
    process.env.NEXT_PUBLIC_BUILDER_APP_URL = 'https://builder.indobase.in/'
    expect(getPublicBuilderUrl()).toBe('https://builder.indobase.in')
    if (prev === undefined) delete process.env.NEXT_PUBLIC_BUILDER_APP_URL
    else process.env.NEXT_PUBLIC_BUILDER_APP_URL = prev
  })
})
