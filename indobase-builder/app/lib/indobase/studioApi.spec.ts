import { describe, expect, it } from 'vitest';

import { canQueueIndobaseDeployment, canQueueIndobaseMobileBuild } from './studioApi';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

describe('studioApi', () => {
  it('allows mobile build queue only for Studio handoff sessions', () => {
    const connection = {
      connectionSource: 'studio_handoff',
      selectedProjectId: 'proj_123',
      indobase: {
        apiUrl: 'https://api.indobase.in',
        authUrl: 'https://api.indobase.in/auth/v1',
        mcpToken: 'token',
        organizationSlug: 'acme',
        projectRef: 'proj_123',
        projectUrl: 'https://proj_123.indobase.in',
        restUrl: 'https://proj_123.indobase.in/rest/v1',
        storageUrl: 'https://proj_123.indobase.in/storage/v1',
        studioUrl: 'https://studio.indobase.in',
      },
    } satisfies Partial<IndobaseConnectionState>;

    expect(canQueueIndobaseMobileBuild(connection as IndobaseConnectionState)).toBe(true);
    expect(canQueueIndobaseDeployment(connection as IndobaseConnectionState)).toBe(true);
  });

  it('blocks mobile build queue for manual connections', () => {
    expect(
      canQueueIndobaseMobileBuild({
        connectionSource: 'manual',
        selectedProjectId: 'proj_123',
      } as IndobaseConnectionState),
    ).toBe(false);
    expect(
      canQueueIndobaseDeployment({
        connectionSource: 'manual',
        selectedProjectId: 'proj_123',
      } as IndobaseConnectionState),
    ).toBe(false);
  });
});
