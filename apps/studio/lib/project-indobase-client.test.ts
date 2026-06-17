import * as supabaseJs from '@indobaseinc/indobase-js'
import * as apiKeysUtils from 'data/api-keys/temp-api-keys-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createProjectIndobaseClient } from './project-indobase-client'

vi.mock('indobase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('data/api-keys/temp-api-keys-utils', () => ({
  getOrRefreshTemporaryApiKey: vi.fn(),
}))

describe('project-indobase-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createProjectIndobaseClient', () => {
    it('should create an Indobase client with temporary API key', async () => {
      const mockApiKey = 'test-api-key-123'
      const mockClient = { from: vi.fn() }
      const projectRef = 'test-project-ref'
      const clientEndpoint = 'https://test.indobase.in'

      vi.mocked(apiKeysUtils.getOrRefreshTemporaryApiKey).mockResolvedValue({
        apiKey: mockApiKey,
        expiryTimeMs: Date.now() + 3600000,
      })
      vi.mocked(supabaseJs.createClient).mockReturnValue(mockClient as any)

      const result = await createProjectIndobaseClient(projectRef, clientEndpoint)

      expect(apiKeysUtils.getOrRefreshTemporaryApiKey).toHaveBeenCalledWith(projectRef)
      expect(supabaseJs.createClient).toHaveBeenCalledWith(clientEndpoint, mockApiKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storage: {
            getItem: expect.any(Function),
            setItem: expect.any(Function),
            removeItem: expect.any(Function),
          },
        },
      })
      expect(result).toBe(mockClient)
    })

    it('should configure storage to not persist session', async () => {
      const mockApiKey = 'test-api-key-456'
      const mockClient = { from: vi.fn() }

      vi.mocked(apiKeysUtils.getOrRefreshTemporaryApiKey).mockResolvedValue({
        apiKey: mockApiKey,
        expiryTimeMs: Date.now() + 3600000,
      })
      vi.mocked(supabaseJs.createClient).mockReturnValue(mockClient as any)

      await createProjectIndobaseClient('ref', 'https://example.com')

      const config = vi.mocked(supabaseJs.createClient).mock.calls[0][2]
      if (!config?.auth?.storage) throw new Error('storage config is missing')
      const storage = config.auth.storage

      // Test storage methods return expected values
      expect(storage.getItem('any-key')).toBeNull()
      expect(storage.setItem('key', 'value')).toBeUndefined()
      expect(storage.removeItem('key')).toBeUndefined()
    })

    it('should throw error if API key retrieval fails', async () => {
      const error = new Error('Failed to get API key')
      vi.mocked(apiKeysUtils.getOrRefreshTemporaryApiKey).mockRejectedValue(error)

      await expect(createProjectIndobaseClient('ref', 'https://example.com')).rejects.toThrow(
        'Failed to get API key'
      )

      expect(supabaseJs.createClient).not.toHaveBeenCalled()
    })

    it('should pass through different project refs and endpoints', async () => {
      const mockApiKey = 'api-key'
      const mockClient = { from: vi.fn() }

      vi.mocked(apiKeysUtils.getOrRefreshTemporaryApiKey).mockResolvedValue({
        apiKey: mockApiKey,
        expiryTimeMs: Date.now() + 3600000,
      })
      vi.mocked(supabaseJs.createClient).mockReturnValue(mockClient as any)

      await createProjectIndobaseClient('project-123', 'https://project123.indobase.in')

      expect(apiKeysUtils.getOrRefreshTemporaryApiKey).toHaveBeenCalledWith('project-123')
      expect(supabaseJs.createClient).toHaveBeenCalledWith(
        'https://project123.indobase.in',
        mockApiKey,
        expect.any(Object)
      )
    })

    it('should disable session persistence options', async () => {
      const mockApiKey = 'api-key'
      const mockClient = { from: vi.fn() }

      vi.mocked(apiKeysUtils.getOrRefreshTemporaryApiKey).mockResolvedValue({
        apiKey: mockApiKey,
        expiryTimeMs: Date.now() + 3600000,
      })
      vi.mocked(supabaseJs.createClient).mockReturnValue(mockClient as any)

      await createProjectIndobaseClient('ref', 'https://example.com')

      const config = vi.mocked(supabaseJs.createClient).mock.calls[0][2]
      if (!config?.auth) throw new Error('auth config is missing')

      expect(config.auth.persistSession).toBe(false)
      expect(config.auth.autoRefreshToken).toBe(false)
      expect(config.auth.detectSessionInUrl).toBe(false)
    })
  })
})
