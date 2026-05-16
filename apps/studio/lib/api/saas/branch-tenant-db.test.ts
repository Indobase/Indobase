import { describe, expect, it } from 'vitest'

import { DEFAULT_BRANCH_SCHEMAS, parseIncludedSchemas, parsePostgresConnectionUrl } from './branch-tenant-db'

describe('branch-tenant-db', () => {
  it('parseIncludedSchemas defaults to public/graphql_public/storage', () => {
    expect(parseIncludedSchemas()).toEqual([...DEFAULT_BRANCH_SCHEMAS])
    expect(parseIncludedSchemas(undefined)).toEqual([...DEFAULT_BRANCH_SCHEMAS])
  })

  it('parseIncludedSchemas splits and dedupes query values', () => {
    expect(parseIncludedSchemas('public, custom ,public')).toEqual(['public', 'custom'])
  })

  it('parsePostgresConnectionUrl parses tenant URIs', () => {
    const parts = parsePostgresConnectionUrl(
      'postgresql://tenant_foo:secret%40x@db.example.com:5433/tenantdb_foo'
    )
    expect(parts.host).toBe('db.example.com')
    expect(parts.port).toBe('5433')
    expect(parts.user).toBe('tenant_foo')
    expect(parts.password).toBe('secret@x')
    expect(parts.database).toBe('tenantdb_foo')
  })
})
