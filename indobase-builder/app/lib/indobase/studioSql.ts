import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import { isIndobaseStudioManagedConnection } from '~/lib/indobase/connection';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

type ExecuteIndobaseSqlParams = {
  connection: SupabaseConnectionState;
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
  if (!isIndobaseStudioManagedConnection(connection)) {
    throw new Error('Indobase Studio connection is required');
  }

  const projectRef = connection.indobase.projectRef || connection.selectedProjectId;
  const studioUrl = connection.indobase.studioUrl;
  const mcpToken = connection.indobase.mcpToken;

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

  return payload;
}
