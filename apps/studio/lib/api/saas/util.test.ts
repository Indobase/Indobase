import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assertSaaSBackend, encryptString, encryptedConnectionForPgMeta, getConnectionString } from './util'

vi.mock('lib/constants', () => ({
  IS_SAAS: false,
}))

vi.mock('crypto-js', () => {
  const mockEncrypt = vi.fn()
  return {
    default: {
      AES: {
        encrypt: mockEncrypt,
      },
    },
    AES: {
      encrypt: mockEncrypt,
    },
  }
})

describe('api/saas/util', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('assertSaaSBackend', () => {
    it('should not throw (SaaS-only build)', () => {
      expect(() => assertSaaSBackend()).not.toThrow()
    })
  })

  describe('encryptString', () => {
    it('should encrypt string using AES', async () => {
      const crypto = await import('crypto-js')
      const mockEncrypted = 'encrypted-string-123'
      vi.mocked(crypto.default.AES.encrypt).mockReturnValue({
        toString: () => mockEncrypted,
      } as any)

      const result = encryptString('my-secret-data')

      expect(crypto.default.AES.encrypt).toHaveBeenCalledWith('my-secret-data', expect.any(String))
      expect(result).toBe(mockEncrypted)
    })

    it('should return encrypted string as string', async () => {
      const crypto = await import('crypto-js')
      vi.mocked(crypto.default.AES.encrypt).mockReturnValue({
        toString: () => 'U2FsdGVkX1+abc123',
      } as any)

      const result = encryptString('test')

      expect(typeof result).toBe('string')
      expect(result).toBe('U2FsdGVkX1+abc123')
    })
  })

  describe('getConnectionString', () => {
    beforeEach(() => {
      vi.resetModules()
    })

    it('should build connection string with read-write user', async () => {
      vi.stubEnv('POSTGRES_HOST', 'localhost')
      vi.stubEnv('POSTGRES_PORT', '5432')
      vi.stubEnv('POSTGRES_DB', 'testdb')
      vi.stubEnv('POSTGRES_PASSWORD', 'testpass')
      vi.stubEnv('POSTGRES_USER_READ_WRITE', 'admin_user')

      // Re-import to get updated env values
      const { getConnectionString } = await import('./util')

      const result = getConnectionString({ readOnly: false })

      expect(result).toBe('postgresql://admin_user:testpass@localhost:5432/testdb')
    })

    it('should build connection string with read-only user', async () => {
      vi.stubEnv('POSTGRES_HOST', 'db.example.com')
      vi.stubEnv('POSTGRES_PORT', '5433')
      vi.stubEnv('POSTGRES_DB', 'mydb')
      vi.stubEnv('POSTGRES_PASSWORD', 'secret')
      vi.stubEnv('POSTGRES_USER_READ_ONLY', 'readonly_user')

      const { getConnectionString } = await import('./util')

      const result = getConnectionString({ readOnly: true })

      expect(result).toBe('postgresql://readonly_user:secret@db.example.com:5433/mydb')
    })

    it('should use default values when env vars not set', async () => {
      vi.stubEnv('POSTGRES_HOST', '')
      vi.stubEnv('POSTGRES_PORT', '')
      vi.stubEnv('POSTGRES_DB', '')
      vi.stubEnv('POSTGRES_PASSWORD', '')
      vi.stubEnv('POSTGRES_USER_READ_WRITE', '')
      vi.stubEnv('POSTGRES_USER_READ_ONLY', '')

      const { getConnectionString } = await import('./util')

      const resultReadWrite = getConnectionString({ readOnly: false })
      const resultReadOnly = getConnectionString({ readOnly: true })

      expect(resultReadWrite).toBe(
        'postgresql://postgres:postgres@indobase-db:5432/postgres'
      )
      expect(resultReadOnly).toBe(
        'postgresql://supabase_read_only_user:postgres@indobase-db:5432/postgres'
      )
    })

    it('should percent-encode @ and other special chars in user and password', async () => {
      vi.stubEnv('POSTGRES_HOST', 'db.internal')
      vi.stubEnv('POSTGRES_PORT', '5432')
      vi.stubEnv('POSTGRES_DB', 'postgres')
      vi.stubEnv('POSTGRES_PASSWORD', 'Indobase@100')
      vi.stubEnv('POSTGRES_USER_READ_WRITE', 'my:user')
      vi.stubEnv('POSTGRES_USER_READ_ONLY', 'ro_user')

      const { getConnectionString } = await import('./util')

      expect(getConnectionString({ readOnly: false })).toBe(
        'postgresql://my%3Auser:Indobase%40100@db.internal:5432/postgres'
      )
    })
  })

  describe('encryptedConnectionForPgMeta', () => {
    it('encrypts tenant database URL when non-empty after trim', async () => {
      const crypto = await import('crypto-js')
      vi.mocked(crypto.default.AES.encrypt).mockReturnValue({
        toString: () => 'tenant-encrypted',
      } as any)

      const result = encryptedConnectionForPgMeta(' postgresql://u:p@tenant:5432/db ')

      expect(crypto.default.AES.encrypt).toHaveBeenCalledTimes(1)
      expect(crypto.default.AES.encrypt).toHaveBeenCalledWith(
        'postgresql://u:p@tenant:5432/db',
        expect.any(String)
      )
      expect(result).toBe('tenant-encrypted')
    })

    it('falls back to global POSTGRES_* when tenant URL is nullish or blank (non-SaaS)', async () => {
      vi.resetModules()
      vi.stubEnv('POSTGRES_HOST', 'db.fallback')
      vi.stubEnv('POSTGRES_PORT', '5432')
      vi.stubEnv('POSTGRES_DB', 'postgres')
      vi.stubEnv('POSTGRES_PASSWORD', 'pw')
      vi.stubEnv('POSTGRES_USER_READ_ONLY', 'ro')
      vi.stubEnv('NEXT_PUBLIC_INDOBASE_SAAS', 'false')

      const crypto = await import('crypto-js')
      vi.mocked(crypto.default.AES.encrypt).mockReturnValue({
        toString: () => 'fallback-encrypted',
      } as any)

      const { encryptedConnectionForPgMeta: enc } = await import('./util')

      expect(enc(null)).toBe('fallback-encrypted')
      expect(enc(undefined)).toBe('fallback-encrypted')
      expect(enc('   ')).toBe('fallback-encrypted')

      expect(crypto.default.AES.encrypt).toHaveBeenCalledWith(
        'postgresql://ro:pw@db.fallback:5432/postgres',
        expect.any(String)
      )
    })

    it('falls back to shared POSTGRES_* when tenant URL is missing (SaaS)', async () => {
      vi.resetModules()
      vi.stubEnv('NEXT_PUBLIC_INDOBASE_SAAS', 'true')
      vi.stubEnv('POSTGRES_HOST', 'db.saas-fallback')
      vi.stubEnv('POSTGRES_PORT', '5432')
      vi.stubEnv('POSTGRES_DB', 'postgres')
      vi.stubEnv('POSTGRES_PASSWORD', 'pw')
      vi.stubEnv('POSTGRES_USER_READ_WRITE', 'postgres')
      vi.doMock('lib/constants', () => ({ IS_SAAS: true }))

      const crypto = await import('crypto-js')
      vi.mocked(crypto.default.AES.encrypt).mockReturnValue({
        toString: () => 'saas-fallback-encrypted',
      } as any)

      const { encryptedConnectionForPgMeta: enc } = await import('./util')
      expect(enc(null)).toBe('saas-fallback-encrypted')
    })
  })
})
