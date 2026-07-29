import { beforeEach, describe, expect, it, vi } from 'vitest'
import CryptoJS from 'crypto-js'

describe('api/saas/util decryptString', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('decrypts API keys encrypted with CRYPTO_KEY when PG_META_CRYPTO_KEY is also set', async () => {
    vi.stubEnv('PG_META_CRYPTO_KEY', 'pg-meta-key')
    vi.stubEnv('CRYPTO_KEY', 'project-key')

    const ciphertext = CryptoJS.AES.encrypt('secret-jwt-token', 'project-key').toString()
    const { decryptString } = await import('./util')
    expect(decryptString(ciphertext)).toBe('secret-jwt-token')
  })

  it('decrypts connection strings encrypted with PG_META_CRYPTO_KEY', async () => {
    vi.stubEnv('PG_META_CRYPTO_KEY', 'pg-meta-key')
    vi.stubEnv('CRYPTO_KEY', 'project-key')

    const ciphertext = CryptoJS.AES.encrypt(
      'postgresql://u:p@tenant:5432/db',
      'pg-meta-key'
    ).toString()
    const { decryptString } = await import('./util')
    expect(decryptString(ciphertext)).toBe('postgresql://u:p@tenant:5432/db')
  })

  it('throws SecretDecryptionError without leaking env var names', async () => {
    vi.stubEnv('PG_META_CRYPTO_KEY', 'wrong-key')
    vi.stubEnv('CRYPTO_KEY', 'also-wrong')

    const { decryptString } = await import('./util')
    const { SecretDecryptionError } = await import('./secret-decryption-error')

    expect(() => decryptString('U2FsdGVkX1+invalid')).toThrow(SecretDecryptionError)
    try {
      decryptString('U2FsdGVkX1+invalid')
    } catch (error) {
      expect(error).toBeInstanceOf(SecretDecryptionError)
      expect((error as Error).message).not.toMatch(/CRYPTO_KEY|PG_META_CRYPTO_KEY/)
    }
  })
})
