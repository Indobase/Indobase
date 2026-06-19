import { afterEach, describe, expect, it, vi } from 'vitest'

import { PROJECT_ENDPOINT, PROJECT_ENDPOINT_PROTOCOL, PROJECT_REST_URL } from 'lib/constants/api'

import {
  resolvePublicDomainForTenantStack,
  resolveSaaSTenantApiBaseUrl,
  resolveSaaSTenantRestUrls,
  usesTenantPublicApiHost,
} from './tenant-public-urls'

describe('tenant-public-urls', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolvePublicDomainForTenantStack prefers SAAS_PUBLIC_DOMAIN', () => {
    vi.stubEnv('SAAS_PUBLIC_DOMAIN', 'https://app.example.com:443/extra')
    expect(resolvePublicDomainForTenantStack()).toBe('app.example.com')
  })

  it('resolvePublicDomainForTenantStack strips api. from SUPABASE_PUBLIC_URL hostname', () => {
    vi.stubEnv('SAAS_PUBLIC_DOMAIN', '')
    vi.stubEnv('SUPABASE_PUBLIC_URL', 'https://api.indobase.in')
    expect(resolvePublicDomainForTenantStack()).toBe('indobase.in')
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

  it('usesTenantPublicApiHost mirrors dedicated tenant DB for isolated stacks', () => {
    expect(usesTenantPublicApiHost(true)).toBe(true)
    expect(usesTenantPublicApiHost(false)).toBe(false)
    expect(usesTenantPublicApiHost(true, 'shared_gateway')).toBe(false)
    expect(usesTenantPublicApiHost(true, 'model_a')).toBe(false)
  })

  it('resolveSaaSTenantApiBaseUrl returns origin without /rest/v1 path', () => {
    vi.stubEnv('SAAS_PUBLIC_DOMAIN', 'indobase.in')
    expect(resolveSaaSTenantApiBaseUrl('my-project', true)).toBe('https://my-project.indobase.in')
  })
})
