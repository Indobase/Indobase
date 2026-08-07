import { afterEach, describe, expect, it, vi } from 'vitest'

import { launchOsBusinessForApi } from './os-business-launch'

const mockPublish = vi.fn()
const mockLaunch = vi.fn()

vi.mock('@indobase/platform', () => ({
  Platform: { events: { publish: vi.fn(), subscribe: vi.fn() } },
  createExecutionPublisher: vi.fn(() => ({
    publish: mockPublish,
  })),
  createBusinessLauncher: vi.fn(() => ({
    launch: mockLaunch,
  })),
  toOsLaunchResponse: vi.fn((result: {
    ok: boolean
    liveUrl?: string
    status: string
    message: string
  }) => {
    if (!result.ok) {
      return { ok: false, status: 'failed', message: result.message }
    }
    return {
      ok: true,
      url: result.liveUrl,
      status: result.status === 'live' ? 'published' : result.status,
      message: result.message,
    }
  }),
}))

vi.mock('./provisioner-deployment-adapter', () => ({
  createProvisionerDeploymentAdapter: vi.fn(() => ({})),
}))

vi.mock('./os-publish-preflight', () => ({
  createStudioPublishPreflight: vi.fn(() => ({})),
}))

vi.mock('./os-publish-ports', () => ({
  createStudioFreezeSnapshotPort: vi.fn(() => ({})),
  createStudioBuildArtifactPort: vi.fn(() => ({})),
  createStudioCapabilityEnsurePort: vi.fn(() => ({})),
  createStudioMarkLivePort: vi.fn(() => ({})),
}))

const mockPlannerPort = { plan: vi.fn() }
const mockEnsurePort = { ensureCapabilities: vi.fn() }
const mockConfigurePort = { configure: vi.fn() }
const mockVerifyPort = { verify: vi.fn() }
const mockOperatorPort = { startOperator: vi.fn() }

vi.mock('./os-launch-planner', () => ({
  createStudioBusinessPlannerPort: vi.fn(() => mockPlannerPort),
  createStudioBusinessEnsureCapabilitiesPort: vi.fn(() => mockEnsurePort),
}))

vi.mock('./os-business-configure', () => ({
  createStudioBusinessConfigurePort: vi.fn(() => mockConfigurePort),
}))

vi.mock('./os-business-operate-ports', () => ({
  createStudioBusinessVerifyPort: vi.fn(() => mockVerifyPort),
  createStudioBusinessOperatorPort: vi.fn(() => mockOperatorPort),
}))

import { createBusinessLauncher } from '@indobase/platform'
import { createStudioBusinessConfigurePort } from './os-business-configure'
import {
  createStudioBusinessEnsureCapabilitiesPort,
  createStudioBusinessPlannerPort,
} from './os-launch-planner'
import {
  createStudioBusinessOperatorPort,
  createStudioBusinessVerifyPort,
} from './os-business-operate-ports'

describe('launchOsBusinessForApi', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('maps live business result to bridge-compatible published response', async () => {
    mockLaunch.mockResolvedValue({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      status: 'live',
      message: 'Your business is now live',
      stage: 'EmitEvents',
    })

    const result = await launchOsBusinessForApi({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
      workspaceRef: 'ws_ref',
    })

    expect(result).toEqual({
      ok: true,
      status: 'published',
      url: 'https://ws_ref.indobase.in',
      message: 'Your business is now live',
    })
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRef: 'ws_ref',
        reason: 'os_launch',
      }),
    )
    expect(createBusinessLauncher).toHaveBeenCalledWith(
      expect.objectContaining({
        planner: mockPlannerPort,
        ensureCapabilities: mockEnsurePort,
        configure: mockConfigurePort,
        verify: mockVerifyPort,
        operator: mockOperatorPort,
      }),
    )
    expect(createStudioBusinessPlannerPort).toHaveBeenCalled()
    expect(createStudioBusinessEnsureCapabilitiesPort).toHaveBeenCalled()
    expect(createStudioBusinessConfigurePort).toHaveBeenCalled()
    expect(createStudioBusinessVerifyPort).toHaveBeenCalled()
    expect(createStudioBusinessOperatorPort).toHaveBeenCalled()
  })

  it('forwards intent into business.launch input', async () => {
    mockLaunch.mockResolvedValue({
      ok: true,
      liveUrl: 'https://ws_ref.indobase.in',
      status: 'live',
      message: 'Your business is now live',
      stage: 'EmitEvents',
    })

    await launchOsBusinessForApi({
      claims: { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never,
      workspaceRef: 'ws_ref',
      intent: 'Need login and payments',
    })

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRef: 'ws_ref',
        intent: 'Need login and payments',
      }),
    )
  })
})
