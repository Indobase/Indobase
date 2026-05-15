import { describe, expect, it } from 'vitest'

import { postgresJdbcUrlToEcto } from './platform'

describe('postgresJdbcUrlToEcto', () => {
  it('maps postgresql:// to ecto://', () => {
    expect(postgresJdbcUrlToEcto('postgresql://u:p@h:5432/db')).toBe('ecto://u:p@h:5432/db')
  })

  it('maps postgres:// to ecto://', () => {
    expect(postgresJdbcUrlToEcto('postgres://u:p@h/db')).toBe('ecto://u:p@h/db')
  })
})
