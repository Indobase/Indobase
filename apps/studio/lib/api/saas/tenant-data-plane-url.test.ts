import { describe, expect, it } from 'vitest'

import { postgresUrlWithDbRole } from './platform'

describe('postgresUrlWithDbRole', () => {
  const base =
    'postgresql://tenant_myproj:secret%40x@indobase-db:5432/tenantdb_myproj?sslmode=disable'

  it('swaps user and keeps password from URL when rolePassword omitted', () => {
    const out = postgresUrlWithDbRole(base, 'authenticator')
    const u = new URL(out)
    expect(u.username).toBe('authenticator')
    expect(u.password).toBe(encodeURIComponent('secret@x'))
    expect(u.hostname).toBe('indobase-db')
    expect(u.pathname).toBe('/tenantdb_myproj')
  })

  it('accepts postgres:// scheme', () => {
    const out = postgresUrlWithDbRole(
      'postgres://t:p@db.internal:5432/db1',
      'supabase_storage_admin'
    )
    expect(out.startsWith('postgresql://')).toBe(true)
  })

  it('overrides password when rolePassword provided', () => {
    const out = postgresUrlWithDbRole(base, 'authenticator', 'aux-only-pass')
    expect(new URL(out).password).toBe(encodeURIComponent('aux-only-pass'))
  })
})
