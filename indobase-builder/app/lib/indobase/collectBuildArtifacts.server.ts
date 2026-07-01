import type { FileMap } from '~/lib/.server/llm/constants';
import type { CollectBuildArtifactsResult } from '~/lib/indobase/collectBuildArtifacts';
import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

export async function collectBuildArtifactsViaServer(
  connection: SupabaseConnectionState,
  files: FileMap,
): Promise<CollectBuildArtifactsResult> {
  const response = await fetch(
    '/api/indobase/server-build',
    getBuilderRequestInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files,
        credentials: connection.credentials,
        projectRef: connection.indobase?.projectRef || connection.selectedProjectId,
        studioUrl: connection.indobase?.studioUrl,
      }),
    }),
  );

  const payload = (await response.json()) as CollectBuildArtifactsResult;

  if (!response.ok && !payload.error) {
    return {
      success: false,
      error: `Server build failed (${response.status})`,
    };
  }

  return payload;
}
