import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as util from '../util'
import * as fileSystemStore from './fileSystemStore'
import { getFunctionsArtifactStore } from './index'

vi.mock('../util', () => ({
  assertSaaSBackend: vi.fn(),
}))

vi.mock('./fileSystemStore', () => ({
  FileSystemFunctionsArtifactStore: vi.fn(),
}))

describe('api/saas/functions/index', () => {
  let originalEdgeFunctionsFolder: string | undefined

  beforeEach(() => {
    originalEdgeFunctionsFolder = process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER
    vi.resetAllMocks()
  })

  afterEach(() => {
    if (originalEdgeFunctionsFolder !== undefined) {
      process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER = originalEdgeFunctionsFolder
    } else {
      delete process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER
    }
  })

  describe('getFunctionsArtifactStore', () => {
    it('should call assertSaaSBackend', () => {
      process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER = '/tmp/functions'

      getFunctionsArtifactStore()

      expect(util.assertSaaSBackend).toHaveBeenCalled()
    })

    it('should throw error if EDGE_FUNCTIONS_MANAGEMENT_FOLDER is not set', () => {
      delete process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER

      expect(() => getFunctionsArtifactStore()).toThrow(
        'EDGE_FUNCTIONS_MANAGEMENT_FOLDER is required'
      )
    })

    it('should fall back to the root folder when no project ref is given', () => {
      process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER = '/var/lib/functions'

      getFunctionsArtifactStore()

      expect(fileSystemStore.FileSystemFunctionsArtifactStore).toHaveBeenCalledWith(
        '/var/lib/functions'
      )
    })

    it('should scope the store to a per-tenant subfolder when project ref is provided', () => {
      process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER = '/var/lib/functions'

      getFunctionsArtifactStore('p-abcdef-1234')

      expect(fileSystemStore.FileSystemFunctionsArtifactStore).toHaveBeenCalledWith(
        '/var/lib/functions/p-abcdef-1234'
      )
    })

    it('should sanitize unsafe characters out of the project ref', () => {
      process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER = '/var/lib/functions'

      getFunctionsArtifactStore('../escape')

      // path separators and dots should be replaced (never preserved verbatim)
      // so we can never escape the root.
      expect(fileSystemStore.FileSystemFunctionsArtifactStore).toHaveBeenCalledWith(
        '/var/lib/functions/___escape'
      )
    })

    it('should return FileSystemFunctionsArtifactStore instance', () => {
      const mockInstance = {
        folderPath: '/tmp/test',
        getFunctions: vi.fn(),
        getFunctionBySlug: vi.fn(),
        getFileEntriesBySlug: vi.fn(),
      }
      vi.mocked(fileSystemStore.FileSystemFunctionsArtifactStore).mockReturnValue(
        mockInstance as any
      )
      process.env.EDGE_FUNCTIONS_MANAGEMENT_FOLDER = '/tmp/test'

      const result = getFunctionsArtifactStore()

      expect(result).toBe(mockInstance)
    })
  })
})
