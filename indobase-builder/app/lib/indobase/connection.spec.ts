import { describe, expect, it } from 'vitest';
import { isIndobaseStudioManagedConnection } from './connection';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

describe('isIndobaseStudioManagedConnection', () => {
  it('returns true for a valid Studio handoff connection', () => {
    const connection = {
      connectionSource: 'studio_handoff',
      isConnected: true,
      selectedProjectId: 'proj_123',
      indobase: {
        apiUrl: 'https://proj.indobase.in',
        authUrl: 'https://proj.indobase.in/auth/v1',
        mcpToken: 'token',
        organizationSlug: 'org',
        projectRef: 'proj_123',
        projectUrl: 'https://proj.indobase.in',
        restUrl: 'https://proj.indobase.in/rest/v1',
        storageUrl: 'https://proj.indobase.in/storage/v1',
        studioUrl: 'https://studio.indobase.in',
      },
    } satisfies Partial<SupabaseConnectionState>;

    expect(isIndobaseStudioManagedConnection(connection as SupabaseConnectionState)).toBe(true);
  });
});
