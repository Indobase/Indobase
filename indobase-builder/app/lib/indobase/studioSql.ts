import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import { hasIndobaseStudioHandoff } from '~/lib/indobase/connection';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

type ExecuteIndobaseSqlParams = {
  connection: IndobaseConnectionState;
  operation?: 'query' | 'migration';
  query: string;
  name?: string;
};

export async function executeIndobaseSql({
  connection,
  operation = 'query',
  query,
  name,
}: ExecuteIndobaseSqlParams) {
  if (!hasIndobaseStudioHandoff(connection)) {
    throw new Error('Indobase Studio connection is required');
  }

  const projectRef = connection.indobase!.projectRef || connection.selectedProjectId!;
  const studioUrl = connection.indobase!.studioUrl;
  const mcpToken = connection.indobase?.mcpToken;

  const response = await fetch(
    '/api/indobase/sql',
    getBuilderRequestInit({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
      projectRef,
      studioUrl,
      mcpToken,
      query,
      operation,
      name,
    }),
    }),
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Indobase SQL request failed');
  }

  /*
   * A migration can change the schema — drop the cached snapshot so the next prompt is fresh.
   * Dynamic import avoids a static import cycle (studioSchema imports this module).
   */
  if (operation === 'migration') {
    void import('~/lib/indobase/studioSchema')
      .then(({ invalidateStudioSchemaCache }) => invalidateStudioSchemaCache(projectRef))
      .catch(() => undefined);
  }

  return payload;
}
