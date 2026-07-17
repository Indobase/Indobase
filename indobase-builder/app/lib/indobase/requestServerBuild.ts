import type { CollectBuildArtifactsResult } from '~/lib/indobase/collectBuildArtifacts';
import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import type { FileMap } from '~/lib/stores/files';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

export async function collectBuildArtifactsViaServer(
  connection: IndobaseConnectionState,
  files: FileMap,
): Promise<CollectBuildArtifactsResult> {
  try {
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

    const payload = (await response.json().catch(() => ({}))) as CollectBuildArtifactsResult;

    if (!response.ok && !payload.error) {
      return {
        success: false,
        error: `Server build failed (${response.status})`,
      };
    }

    if (!payload.success) {
      return {
        success: false,
        error: payload.error || `Server build failed (${response.status})`,
      };
    }

    return payload;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Server build request failed',
    };
  }
}
