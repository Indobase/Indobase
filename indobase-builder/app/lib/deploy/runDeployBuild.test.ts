import { describe, expect, it, vi, beforeEach } from 'vitest';

import { runDeployBuildStep } from './runDeployBuild';

vi.mock('~/lib/indobase/collectBuildArtifacts', () => ({
  collectBuildArtifacts: vi.fn(),
}));

vi.mock('~/lib/indobase/resolveProjectBuild', () => ({
  resolveProjectBuild: vi.fn(),
}));

vi.mock('~/lib/indobase/studioApi', () => ({
  canQueueIndobaseDeployment: vi.fn(),
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    files: {
      get: vi.fn(() => ({
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({ scripts: { build: 'vite build' } }),
        },
        '/home/project/index.html': { type: 'file', isBinary: false, content: '<div id="root"></div>' },
        '/home/project/src/main.tsx': { type: 'file', isBinary: false, content: 'export {};' },
      })),
    },
  },
}));

import { collectBuildArtifacts } from '~/lib/indobase/collectBuildArtifacts';
import { resolveProjectBuild } from '~/lib/indobase/resolveProjectBuild';
import { canQueueIndobaseDeployment } from '~/lib/indobase/studioApi';

const mockConnection = {
  connectionSource: 'studio_handoff' as const,
  selectedProjectId: 'test-ref',
  indobase: { studioUrl: 'https://studio.indobase.in' },
};

describe('runDeployBuildStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses server build when Studio-linked', async () => {
    vi.mocked(canQueueIndobaseDeployment).mockReturnValue(true);
    vi.mocked(resolveProjectBuild).mockResolvedValue({
      success: true,
      files: { 'index.html': '<html></html>' },
    });

    const result = await runDeployBuildStep(mockConnection as any);

    expect(resolveProjectBuild).toHaveBeenCalledOnce();
    expect(collectBuildArtifacts).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.usedServerBuild).toBe(true);
  });

  it('falls back to WebContainer build when not Studio-linked', async () => {
    vi.mocked(canQueueIndobaseDeployment).mockReturnValue(false);
    vi.mocked(collectBuildArtifacts).mockResolvedValue({
      success: true,
      files: { 'index.html': '<html>local</html>' },
    });

    const result = await runDeployBuildStep(null);

    expect(collectBuildArtifacts).toHaveBeenCalledOnce();
    expect(resolveProjectBuild).not.toHaveBeenCalled();
    expect(result.usedServerBuild).toBe(false);
  });

  it('marks usedServerBuild false when server build fails', async () => {
    vi.mocked(canQueueIndobaseDeployment).mockReturnValue(true);
    vi.mocked(resolveProjectBuild).mockResolvedValue({
      success: false,
      error: 'build failed',
    });

    const result = await runDeployBuildStep(mockConnection as any);

    expect(result.success).toBe(false);
    expect(result.usedServerBuild).toBe(false);
  });
});
