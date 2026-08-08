import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  artifactRefFromMetadata,
  contentHashFromArtifactFiles,
  contentHashFromMetadata,
  createStudioBuildArtifactPort,
  createStudioCapabilityEnsurePort,
  createStudioFreezeSnapshotPort,
  createStudioMarkLivePort,
  extractBuildableSourceFiles,
  extractPublishableArtifactFiles,
  hasHostingArtifacts,
  hasKnownBuilderDraft,
  looksLikeStaticHostingArtifacts,
  selectInProgressDeployment,
  selectReadyDeploymentForFreeze,
} from './os-publish-ports'

vi.mock('./deployments', () => ({
  listProjectDeployments: vi.fn(),
  updateProjectDeployment: vi.fn(),
  createProjectDeployment: vi.fn(),
}))

vi.mock('./deployment-artifacts', () => ({
  publishDeploymentArtifacts: vi.fn(),
}))

vi.mock('./os-ensurer', () => ({
  ensureOsCapability: vi.fn(),
}))

vi.mock('./platform', () => ({
  ensureSaasTables: vi.fn(),
  getGotrueUserId: vi.fn(() => 'user-1'),
}))

vi.mock('./query', () => ({
  executeQuery: vi.fn(),
}))

import { createProjectDeployment, listProjectDeployments, updateProjectDeployment } from './deployments'
import { publishDeploymentArtifacts } from './deployment-artifacts'
import { ensureOsCapability } from './os-ensurer'
import { executeQuery } from './query'

const claims = { sub: 'user-1', email: 'a@example.com', role: 'authenticated' } as never

const preflightOk = {
  ok: true as const,
  projectRef: 'ws-1',
  provisionState: 'ready' as const,
  hostDomain: 'indobase.in',
  provisionerConfigured: true,
  deployReady: true,
}

describe('os-publish-ports helpers', () => {
  it('prefers ready deployments with hosting_artifacts', () => {
    const picked = selectReadyDeploymentForFreeze([
      {
        id: 'dep-empty',
        status: 'ready',
        metadata: {},
      } as never,
      {
        id: 'dep-files',
        status: 'ready',
        metadata: {
          hosting_artifacts: { file_count: 3, total_bytes: 50, prefix: 'sites/dep-files' },
        },
      } as never,
    ])
    expect(picked?.id).toBe('dep-files')
  })

  it('detects hosting artifacts and content hashes', () => {
    expect(hasHostingArtifacts({ hosting_artifacts: { file_count: 1, prefix: 'sites/x' } })).toBe(
      true,
    )
    expect(contentHashFromMetadata({ content_hash: 'abc' })).toBe('abc')
    expect(
      contentHashFromMetadata({
        hosting_artifacts: { file_count: 2, total_bytes: 10, prefix: 'sites/x' },
      }),
    ).toContain('files:2')
    expect(artifactRefFromMetadata({ hosting_artifacts: { prefix: 'sites/z' } }, 'id')).toBe(
      'sites/z',
    )
  })

  it('hashes payload artifact files stably', () => {
    const a = contentHashFromArtifactFiles({ 'index.html': '<h1>a</h1>', 'a.js': '1' })
    const b = contentHashFromArtifactFiles({ 'a.js': '1', 'index.html': '<h1>a</h1>' })
    expect(a).toBe(b)
    expect(a.startsWith('sha256:')).toBe(true)
  })

  it('extracts publishable artifact files from payload', () => {
    expect(
      extractPublishableArtifactFiles({
        artifacts: { 'index.html': '<html></html>', skip: 1 as never },
      }),
    ).toEqual({ 'index.html': '<html></html>' })
    expect(extractPublishableArtifactFiles({})).toBeNull()
  })

  it('selects in-progress deployments', () => {
    expect(
      selectInProgressDeployment([
        { id: 'r', status: 'ready', metadata: {} } as never,
        { id: 'b', status: 'building', metadata: {} } as never,
      ])?.id,
    ).toBe('b')
  })

  it('detects static vs buildable source files and drafts', () => {
    expect(
      looksLikeStaticHostingArtifacts({ 'index.html': '<html></html>', 'app.js': '1' }),
    ).toBe(true)
    expect(
      looksLikeStaticHostingArtifacts({
        'index.html': '<html></html>',
        'package.json': JSON.stringify({ scripts: { build: 'vite build' } }),
      }),
    ).toBe(false)
    expect(extractBuildableSourceFiles({ sourceFiles: { 'a.ts': '1' } })).toEqual({
      'a.ts': '1',
    })
    expect(hasKnownBuilderDraft({ draft_id: 'draft-1' })).toBe(true)
    expect(hasKnownBuilderDraft({})).toBe(false)
  })
})

describe('os-publish-ports', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('freezes ready deployment as artifact snapshot with source', async () => {
    vi.mocked(listProjectDeployments).mockResolvedValue([
      {
        id: 'dep-ready',
        status: 'ready',
        metadata: {
          hosting_artifacts: { file_count: 2, total_bytes: 100, prefix: 'sites/dep-ready' },
          content_hash: 'sha256:deadbeef',
        },
        project_ref: 'ws-1',
      } as never,
    ])

    const port = createStudioFreezeSnapshotPort({ claims })
    const result = await port.freezeSnapshot({
      projectRef: 'ws-1',
      preflight: preflightOk,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.kind).toBe('artifact')
      expect(result.snapshot.deploymentId).toBe('dep-ready')
      expect(result.snapshot.artifactRef).toBe('sites/dep-ready')
      expect(result.snapshot.contentHash).toBe('sha256:deadbeef')
      expect(result.snapshot.source).toBe('ready_deployment')
    }
  })

  it('freezes payload artifacts with content hash (not live editor)', async () => {
    vi.mocked(listProjectDeployments).mockResolvedValue([])
    const port = createStudioFreezeSnapshotPort({ claims })
    const result = await port.freezeSnapshot({
      projectRef: 'ws-1',
      preflight: preflightOk,
      payload: {
        artifacts: { 'index.html': '<html><body>Hi</body></html>' },
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.kind).toBe('artifact')
      expect(result.snapshot.source).toBe('payload_artifacts')
      expect(result.snapshot.contentHash?.startsWith('sha256:')).toBe(true)
      expect(result.snapshot.snapshotId.startsWith('payload_')).toBe(true)
    }
  })

  it('uses hosting-only freeze when no ready artifact or payload files', async () => {
    vi.mocked(listProjectDeployments).mockResolvedValue([])
    const port = createStudioFreezeSnapshotPort({ claims })
    const result = await port.freezeSnapshot({
      projectRef: 'ws-1',
      preflight: preflightOk,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.kind).toBe('hosting-only')
      expect(result.snapshot.source).toBe('hosting_placeholder')
      expect(result.snapshot.snapshotId).toMatch(/^hosting_ws-1_/)
    }
  })

  it('build resolves ready frozen deployment artifact refs', async () => {
    const port = createStudioBuildArtifactPort({ claims })
    const result = await port.build({
      projectRef: 'ws-1',
      deployReady: true,
      snapshot: {
        snapshotId: 'deploy_x',
        deploymentId: 'x',
        kind: 'artifact',
        artifactRef: 'sites/x',
        source: 'ready_deployment',
      },
    })
    expect(result).toEqual({
      ok: true,
      status: 'ready',
      artifactRef: 'sites/x',
      buildId: 'x',
    })
  })

  it('build publishes payload artifacts via publishDeploymentArtifacts', async () => {
    vi.mocked(createProjectDeployment).mockResolvedValue({
      id: 'dep-new',
      status: 'requested',
      metadata: {},
    } as never)
    vi.mocked(publishDeploymentArtifacts).mockResolvedValue({
      deployment: {
        id: 'dep-new',
        status: 'ready',
        metadata: {
          hosting_artifacts: { file_count: 1, total_bytes: 20, prefix: 'sites/dep-new' },
          content_hash: 'sha256:abc',
        },
      },
      manifest: {
        prefix: 'sites/dep-new',
        file_count: 1,
        total_bytes: 20,
        bucket: 'hosting',
        index_path: 'index.html',
        published_url: 'https://ws-1.indobase.in/',
        route_registered: true,
        site_synced: false,
        storage_url: 'https://example/storage',
      },
    } as never)

    const port = createStudioBuildArtifactPort({ claims })
    const files = { 'index.html': '<html></html>' }
    const result = await port.build({
      projectRef: 'ws-1',
      deployReady: true,
      snapshot: {
        snapshotId: 'payload_abc',
        kind: 'artifact',
        contentHash: contentHashFromArtifactFiles(files),
        source: 'payload_artifacts',
        artifactRef: 'ws-1',
      },
      payload: { artifacts: files },
    })

    expect(result.ok).toBe(true)
    if (result.ok && result.status !== 'queued') {
      expect(result.artifactRef).toBe('sites/dep-new')
      expect(result.buildId).toBe('dep-new')
      expect(result.promoteSnapshot?.kind).toBe('artifact')
    }
    expect(createProjectDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'ws-1',
        skipInlineProcessing: true,
        requestedVia: 'api',
      }),
    )
    expect(publishDeploymentArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: 'dep-new',
        ref: 'ws-1',
        files,
      }),
    )
  })

  it('build returns queued when an active deployment is in progress', async () => {
    vi.mocked(listProjectDeployments).mockResolvedValue([
      {
        id: 'dep-building',
        status: 'building',
        metadata: { hosting_artifacts: { prefix: 'sites/dep-building' } },
      } as never,
    ])

    const port = createStudioBuildArtifactPort({ claims })
    const result = await port.build({
      projectRef: 'ws-1',
      deployReady: true,
      snapshot: {
        snapshotId: 'hosting_ws-1',
        kind: 'hosting-only',
        source: 'hosting_placeholder',
        artifactRef: 'ws-1',
      },
    })

    expect(result).toEqual({
      ok: true,
      status: 'queued',
      buildId: 'dep-building',
      artifactRef: 'sites/dep-building',
      message: 'Your site is still building. Launch will finish when the build is ready.',
    })
  })

  it('build queues building deployment for buildable sourceFiles', async () => {
    vi.mocked(listProjectDeployments).mockResolvedValue([])
    vi.mocked(createProjectDeployment).mockResolvedValue({
      id: 'dep-queued',
      status: 'requested',
      metadata: {},
    } as never)
    vi.mocked(updateProjectDeployment).mockResolvedValue({
      id: 'dep-queued',
      status: 'building',
      metadata: {},
    } as never)

    const port = createStudioBuildArtifactPort({ claims })
    const result = await port.build({
      projectRef: 'ws-1',
      deployReady: true,
      snapshot: {
        snapshotId: 'hosting_ws-1',
        kind: 'hosting-only',
        source: 'hosting_placeholder',
        artifactRef: 'ws-1',
      },
      payload: {
        sourceFiles: {
          'package.json': JSON.stringify({ scripts: { build: 'vite build' } }),
          'src/main.ts': 'console.log(1)',
        },
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('queued')
      expect(result.buildId).toBe('dep-queued')
      expect(result.message).toMatch(/still building/i)
    }
    expect(createProjectDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'ws-1',
        skipInlineProcessing: true,
        metadata: expect.objectContaining({
          os_publish_resume: expect.objectContaining({ pending: true }),
        }),
      }),
    )
    expect(updateProjectDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: 'dep-queued',
        status: 'building',
      }),
    )
  })

  it('build publishes static sourceFiles via publishDeploymentArtifacts', async () => {
    vi.mocked(createProjectDeployment).mockResolvedValue({
      id: 'dep-static',
      status: 'requested',
      metadata: {},
    } as never)
    vi.mocked(publishDeploymentArtifacts).mockResolvedValue({
      deployment: {
        id: 'dep-static',
        status: 'ready',
        metadata: {
          hosting_artifacts: { file_count: 1, total_bytes: 20, prefix: 'sites/dep-static' },
        },
      },
      manifest: {
        prefix: 'sites/dep-static',
        file_count: 1,
        total_bytes: 20,
        bucket: 'hosting',
        index_path: 'index.html',
        published_url: 'https://ws-1.indobase.in/',
        route_registered: true,
        site_synced: false,
        storage_url: 'https://example/storage',
      },
    } as never)

    const port = createStudioBuildArtifactPort({ claims })
    const result = await port.build({
      projectRef: 'ws-1',
      deployReady: true,
      snapshot: {
        snapshotId: 'hosting_ws-1',
        kind: 'hosting-only',
        source: 'hosting_placeholder',
        artifactRef: 'ws-1',
      },
      payload: {
        sourceFiles: { 'index.html': '<html><body>Hi</body></html>' },
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok && result.status !== 'queued') {
      expect(result.buildId).toBe('dep-static')
      expect(result.artifactRef).toBe('sites/dep-static')
    }
    expect(publishDeploymentArtifacts).toHaveBeenCalled()
  })

  it('build keeps hosting-only pass-through when no build inputs', async () => {
    vi.mocked(listProjectDeployments).mockResolvedValue([])
    const port = createStudioBuildArtifactPort({ claims })
    const result = await port.build({
      projectRef: 'ws-1',
      deployReady: true,
      snapshot: {
        snapshotId: 'hosting_ws-1',
        kind: 'hosting-only',
        source: 'hosting_placeholder',
        artifactRef: 'ws-1',
      },
    })
    expect(result).toEqual({
      ok: true,
      status: 'ready',
      artifactRef: 'ws-1',
    })
  })

  it('capability ensure wraps ensureOsCapability for listed caps only', async () => {
    vi.mocked(ensureOsCapability).mockResolvedValue({
      ok: true,
      capability: 'auth',
      capabilityId: 'auth',
      customer_label: 'Customer Login',
      status: 'enabled',
      provision_state: 'ready',
      message: 'Login enabled',
    })
    const port = createStudioCapabilityEnsurePort({ claims })
    const result = await port.ensureCapabilities({
      projectRef: 'ws-1',
      capabilities: ['auth'],
    })
    expect(result.ok).toBe(true)
    expect(ensureOsCapability).toHaveBeenCalledWith({
      claims,
      workspaceRef: 'ws-1',
      capability: 'auth',
    })
  })

  it('markLive persists os_publish on project and deployment', async () => {
    vi.mocked(executeQuery).mockResolvedValue({ data: [], error: null } as never)
    vi.mocked(updateProjectDeployment).mockResolvedValue({} as never)

    const port = createStudioMarkLivePort({ claims })
    await port.markLive({
      projectRef: 'ws-1',
      liveUrl: 'https://ws-1.indobase.in',
      executionId: 'exec_1',
      publishStatus: 'published',
      snapshot: {
        snapshotId: 'deploy_x',
        deploymentId: 'x',
        kind: 'artifact',
        artifactRef: 'sites/x',
        source: 'ready_deployment',
      },
      artifactRef: 'sites/x',
    })

    expect(executeQuery).toHaveBeenCalled()
    expect(updateProjectDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: 'x',
        targetUrl: 'https://ws-1.indobase.in',
      }),
    )
  })

  it('markLive stamps resume_pending when publish is queued', async () => {
    vi.mocked(executeQuery).mockResolvedValue({ data: [], error: null } as never)
    vi.mocked(updateProjectDeployment).mockResolvedValue({} as never)

    const port = createStudioMarkLivePort({ claims })
    await port.markLive({
      projectRef: 'ws-1',
      liveUrl: 'https://ws-1.indobase.in',
      executionId: 'exec_q',
      publishStatus: 'queued',
      snapshot: {
        snapshotId: 'deploy_q',
        deploymentId: 'dep-q',
        kind: 'hosting-only',
        artifactRef: 'ws-1',
        source: 'hosting_placeholder',
      },
      artifactRef: 'ws-1',
    })

    expect(executeQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.arrayContaining([
          'ws-1',
          expect.stringContaining('"resume_pending":true'),
          'user-1',
        ]),
      }),
    )
    expect(updateProjectDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: 'dep-q',
        metadataPatch: expect.objectContaining({
          os_publish_resume: expect.objectContaining({ pending: true }),
        }),
      }),
    )
  })
})
