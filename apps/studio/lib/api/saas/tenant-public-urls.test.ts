import { afterEach, describe, expect, it, vi } from 'vitest'

import { PROJECT_ENDPOINT, PROJECT_ENDPOINT_PROTOCOL, PROJECT_REST_URL } from 'lib/constants/api'

import { resolvePublicDomainForTenantStack, resolveSaaSTenantRestUrls } from './tenant-public-urls'

describe('tenant-public-urls', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolvePublicDomainForTenantStack prefers SAAS_PUBLIC_DOMAIN', () => {
    vi.stubEnv('SAAS_PUBLIC_DOMAIN', 'https://app.example.com:443/extra')
    expect(resolvePublicDomainForTenantStack()).toBe('app.example.com')
  })

  it('resolveSaaSTenantRestUrls matches snapshot for dedicated tenant with TLS domain', () => {
    vi.stubEnv('SAAS_PUBLIC_DOMAIN', 'nb.example.com')
    expect(resolveSaaSTenantRestUrls('abcxyz', true)).toMatchInlineSnapshot(`
      {
        "endpointHost": "abcxyz.nb.example.com",
        "protocol": "https",
        "restUrl": "https://abcxyz.nb.example.com/rest/v1/",
      }
    `)
  })

  it('resolveSaaSTenantRestUrls uses http for localhost public domain', () => {
    vi.stubEnv('SAAS_PUBLIC_DOMAIN', '')
    vi.stubEnv('SUPABASE_PUBLIC_URL', 'http://localhost:8000')
    expect(resolveSaaSTenantRestUrls('abcxyz', true)).toEqual({
      endpointHost: 'abcxyz.localhost',
      protocol: 'http',
      restUrl: 'http://abcxyz.localhost/rest/v1/',
    })
  })

  it('resolveSaaSTenantRestUrls shared stack uses PROJECT_* constants', () => {
    expect(resolveSaaSTenantRestUrls('any', false)).toEqual({
      endpointHost: PROJECT_ENDPOINT,
      restUrl: PROJECT_REST_URL,
      protocol: PROJECT_ENDPOINT_PROTOCOL,
    })
  })
})
