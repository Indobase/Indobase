import { describe, expect, it } from 'vitest';

import { buildConnectionFromSessionAndBackend, type BuilderBackendConfigResponse } from './backendConfig';
import { hasIndobaseStudioHandoff } from './connection';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

const backendData: BuilderBackendConfigResponse = {
  backend: {
    anon_key: 'anon_key',
    api_url: 'https://api.indobase.in',
    auth_url: 'https://api.indobase.in/auth/v1',
    project_name: 'Acme',
    project_ref: 'proj_123',
    project_url: 'https://studio.indobase.in/project/proj_123/backend',
    rest_url: 'https://api.indobase.in/rest/v1/',
    storage_url: 'https://api.indobase.in/storage/v1',
  },
  project_name: 'Acme',
  organization_slug: 'acme',
  studio_url: 'https://studio.indobase.in',
};

describe('buildConnectionFromSessionAndBackend', () => {
  it('reconstructs a connection that satisfies hasIndobaseStudioHandoff', () => {
    const rebuilt = buildConnectionFromSessionAndBackend(
      {
        email: 'ros@indobase.in',
        mcpToken: 'mcp',
        projectRef: 'proj_123',
        studioUrl: 'https://studio.indobase.in',
        organizationSlug: 'acme',
        sub: 'user-1',
      },
      backendData,
    );

    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.credentials?.anonKey).toBe('anon_key');
    expect(rebuilt!.indobase?.mcpToken).toBe('mcp');
    expect(rebuilt!.selectedProjectId).toBe('proj_123');
    expect(rebuilt!.user).toMatchObject({
      email: 'ros@indobase.in',
      id: 'user-1',
    });

    // The whole point of the fix: the rebuilt connection is a valid Studio handoff.
    expect(hasIndobaseStudioHandoff(rebuilt as IndobaseConnectionState)).toBe(true);
  });

  it('returns null when the backend anon key is missing', () => {
    const rebuilt = buildConnectionFromSessionAndBackend(
      { mcpToken: 'mcp', projectRef: 'proj_123', studioUrl: 'https://studio.indobase.in' },
      { ...backendData, backend: { ...backendData.backend, anon_key: '' } },
    );
    expect(rebuilt).toBeNull();
  });

  it('returns null when no project ref is available', () => {
    const rebuilt = buildConnectionFromSessionAndBackend(
      { mcpToken: 'mcp', studioUrl: 'https://studio.indobase.in' },
      { ...backendData, backend: { ...backendData.backend, project_ref: '' } },
    );
    expect(rebuilt).toBeNull();
  });
});
