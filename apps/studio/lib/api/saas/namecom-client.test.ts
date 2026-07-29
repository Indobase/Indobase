import { describe, expect, it } from 'vitest'

import { parseDomainParts, resolveNamecomConfig } from './namecom-client'

describe('namecom-client helpers', () => {
  it('parseDomainParts splits label and tld', () => {
    expect(parseDomainParts('Example.COM')).toEqual({
      label: 'example',
      tld: 'com',
    })
    expect(parseDomainParts('bad')).toBeNull()
  })

  it('resolveNamecomConfig returns null when unset', () => {
    const prevUser = process.env.NAMECOM_USERNAME
    const prevToken = process.env.NAMECOM_API_TOKEN
    delete process.env.NAMECOM_USERNAME
    delete process.env.NAMECOM_API_TOKEN
    expect(resolveNamecomConfig()).toBeNull()
    process.env.NAMECOM_USERNAME = prevUser
    process.env.NAMECOM_API_TOKEN = prevToken
  })
})
