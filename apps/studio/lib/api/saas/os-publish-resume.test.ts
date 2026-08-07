import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  artifactRefFromReadyDeployment,
  isOsPublishResumePending,
  resolveResumeLiveUrl,
  resumeOsPublishAfterDeploymentReady,
} from './os-publish-resume'

vi.mock('./platform', () => ({
  ensureSaasTables: vi.fn(),
}))

vi.mock('./query', () => ({
  executeQuery: vi.fn(),
}))

vi.mock('./tenant-data-plane-provision', () => ({
  ensureTenantSiteHosting: vi.fn(),
}))

import { executeQuery } from './query'
import { ensureTenantSiteHosting } from './tenant-data-plane-provision'

describe('os-publish-resume helpers', () => {
  it('detects resume-pending queued os_publish', () => {
    expect(isOsPublishResumePending({ publish_status: 'queued' })).toBe(true)
    expect(isOsPublishResumePending({ resume_pending: true })).toBe(true)
    expect(isOsPublishResumePending({ publish_status: 'published' })).toBe(false)
    expect(isOsPublishResumePending(null)).toBe(false)
  })

  it('resolves live URL preference order', () => {
    expect(
      resolveResumeLiveUrl({
        pending: { live_url: 'https://reserved.example/' },
        deployment: {
          id: 'd1',
          project_ref: 'ws-1',
          target_url: 'https://ws-1.indobase.in/',
          metadata: {},
          status: 'ready',
        } as never,
      }),
    ).toBe('https://reserved.example/')

    expect(
      resolveResumeLiveUrl({
        pending: {},
        deployment: {
          id: 'd1',
          project_ref: 'ws-1',
          target_url: '',
          metadata: {},
          status: 'ready',
        } as never,
      }),
    ).toBe('https://ws-1.indobase.in')
  })

  it('reads artifact ref from hosting_artifacts', () => {
    expect(
      artifactRefFromReadyDeployment({
        id: 'dep-1',
        metadata: { hosting_artifacts: { prefix: 'sites/dep-1' } },
      } as never),
    ).toBe('sites/dep-1')
  })
})

describe('resumeOsPublishAfterDeploymentReady', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('no-ops when deployment is not ready', async () => {
    const result = await resumeOsPublishAfterDeploymentReady({
      ref: 'ws-1',
      deployment: { id: 'd1', status: 'building', metadata: {}, project_ref: 'ws-1' } as never,
    })
    expect(result).toEqual({ resumed: false, reason: 'not_ready' })
    expect(executeQuery).not.toHaveBeenCalled()
  })

  it('no-ops when no pending os_publish', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      data: [{ auth_config: { os_publish: { publish_status: 'published' } } }],
      error: null,
    } as never)

    const result = await resumeOsPublishAfterDeploymentReady({
      ref: 'ws-1',
      deployment: {
        id: 'd1',
        status: 'ready',
        metadata: {},
        project_ref: 'ws-1',
        target_url: 'https://ws-1.indobase.in/',
      } as never,
    })

    expect(result.resumed).toBe(false)
    expect(result.reason).toBe('no_pending')
    expect(ensureTenantSiteHosting).not.toHaveBeenCalled()
  })

  it('resumes MarkLive + site hosting when queued os_publish is pending', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        data: [
          {
            auth_config: {
              os_publish: {
                publish_status: 'queued',
                resume_pending: true,
                live_url: 'https://ws-1.indobase.in',
                execution_id: 'exec_1',
                deployment_id: 'dep-ready',
              },
            },
          },
        ],
        error: null,
      } as never)
      .mockResolvedValue({ data: [], error: null } as never)

    vi.mocked(ensureTenantSiteHosting).mockResolvedValue({} as never)

    const result = await resumeOsPublishAfterDeploymentReady({
      ref: 'ws-1',
      deployment: {
        id: 'dep-ready',
        status: 'ready',
        metadata: {
          hosting_artifacts: { prefix: 'sites/dep-ready', file_count: 2 },
        },
        project_ref: 'ws-1',
        target_url: 'https://ws-1.indobase.in/',
      } as never,
    })

    expect(result).toEqual({
      resumed: true,
      liveUrl: 'https://ws-1.indobase.in',
    })
    expect(ensureTenantSiteHosting).toHaveBeenCalledWith('ws-1')
    expect(executeQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.arrayContaining([
          'ws-1',
          expect.stringContaining('"publish_status":"published"'),
        ]),
      }),
    )
  })

  it('skips resume when pending deployment_id does not match and ready has no artifacts', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      data: [
        {
          auth_config: {
            os_publish: {
              publish_status: 'queued',
              deployment_id: 'other-dep',
            },
          },
        },
      ],
      error: null,
    } as never)

    const result = await resumeOsPublishAfterDeploymentReady({
      ref: 'ws-1',
      deployment: {
        id: 'dep-ready',
        status: 'ready',
        metadata: {},
        project_ref: 'ws-1',
      } as never,
    })

    expect(result).toEqual({ resumed: false, reason: 'deployment_mismatch' })
    expect(ensureTenantSiteHosting).not.toHaveBeenCalled()
  })

  it('resumes when Builder finishes a new ready deployment with artifacts', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        data: [
          {
            auth_config: {
              os_publish: {
                publish_status: 'queued',
                resume_pending: true,
                live_url: 'https://ws-1.indobase.in',
                execution_id: 'exec_1',
                deployment_id: 'dep-queued',
              },
            },
          },
        ],
        error: null,
      } as never)
      .mockResolvedValue({ data: [], error: null } as never)
    vi.mocked(ensureTenantSiteHosting).mockResolvedValue({} as never)

    const result = await resumeOsPublishAfterDeploymentReady({
      ref: 'ws-1',
      deployment: {
        id: 'dep-from-builder',
        status: 'ready',
        metadata: {
          hosting_artifacts: { prefix: 'sites/dep-from-builder', file_count: 3 },
        },
        project_ref: 'ws-1',
        target_url: 'https://ws-1.indobase.in/',
      } as never,
    })

    expect(result.resumed).toBe(true)
    expect(ensureTenantSiteHosting).toHaveBeenCalledWith('ws-1')
  })
})
