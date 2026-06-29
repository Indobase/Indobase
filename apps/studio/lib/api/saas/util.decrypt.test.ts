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
})
