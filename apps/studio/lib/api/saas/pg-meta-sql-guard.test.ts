import { describe, expect, it } from 'vitest'

import { getBlockedSaasCatalogQueryReason } from './pg-meta-sql-guard'

describe('getBlockedSaasCatalogQueryReason', () => {
  it('blocks listing all databases', () => {
    expect(
      getBlockedSaasCatalogQueryReason(
        'select sum(pg_database_size(pg_database.datname)) from pg_database'
      )
    ).toBeTruthy()
  })

  it('allows current database size metrics', () => {
    expect(
      getBlockedSaasCatalogQueryReason(
        'select pg_database_size(current_database())::bigint as db_size'
      )
    ).toBeNull()
  })
})
