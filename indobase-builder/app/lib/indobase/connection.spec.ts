import { describe, expect, it } from 'vitest';
import { hasIndobaseStudioHandoff, isIndobaseStudioManagedConnection } from './connection';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

const baseHandoff = {
  connectionSource: 'studio_handoff',
  isConnected: true,
  selectedProjectId: 'proj_123',
  credentials: {
    anonKey: 'anon',
    supabaseUrl: 'https://proj.indobase.in',
  },
  indobase: {
    apiUrl: 'https://proj.indobase.in',
    authUrl: 'https://proj.indobase.in/auth/v1',
    organizationSlug: 'org',
    projectRef: 'proj_123',
    projectUrl: 'https://studio.indobase.in/project/proj_123/backend',
    restUrl: 'https://proj.indobase.in/rest/v1',
    storageUrl: 'https://proj.indobase.in/storage/v1',
    studioUrl: 'https://studio.indobase.in',
  },
} satisfies Partial<SupabaseConnectionState>;

describe('hasIndobaseStudioHandoff', () => {
  it('returns true when backend credentials exist without an MCP token', () => {
    expect(hasIndobaseStudioHandoff(baseHandoff as SupabaseConnectionState)).toBe(true);
  });
});

describe('isIndobaseStudioManagedConnection', () => {
  it('returns true for a valid Studio handoff connection with MCP token', () => {
    const connection = {
      ...baseHandoff,
      indobase: {
        ...baseHandoff.indobase,
        mcpToken: 'token',
      },
    } satisfies Partial<SupabaseConnectionState>;

    expect(isIndobaseStudioManagedConnection(connection as SupabaseConnectionState)).toBe(true);
  });

  it('returns false when MCP token is missing', () => {
    expect(isIndobaseStudioManagedConnection(baseHandoff as SupabaseConnectionState)).toBe(false);
  });
});
