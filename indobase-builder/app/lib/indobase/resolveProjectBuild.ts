import type { CollectBuildArtifactsResult } from '~/lib/indobase/collectBuildArtifacts';
import { collectBuildArtifacts } from '~/lib/indobase/collectBuildArtifacts';
import { ensureNpmDependencies } from '~/lib/indobase/ensureNpmDependencies';
import { collectBuildArtifactsViaServer } from '~/lib/indobase/requestServerBuild';
import { canQueueIndobaseDeployment } from '~/lib/indobase/studioApi';
import type { FileMap } from '~/lib/stores/files';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

export async function resolveProjectBuild(options: {
  connection: SupabaseConnectionState;
  files: FileMap;
}): Promise<CollectBuildArtifactsResult> {
  const { connection, files } = options;
  const canUseServer = canQueueIndobaseDeployment(connection);

  if (canUseServer) {
    const serverBuild = await collectBuildArtifactsViaServer(connection, files);

    if (serverBuild.success) {
      return serverBuild;
    }
  }

  const installResult = await ensureNpmDependencies();

  if (!installResult.success) {
    return {
      success: false,
      error: installResult.error || 'npm install failed before build',
    };
  }

  const localBuild = await collectBuildArtifacts();

  if (localBuild.success || !canUseServer) {
    return localBuild;
  }

  const serverRetry = await collectBuildArtifactsViaServer(connection, files);

  if (serverRetry.success) {
    return serverRetry;
  }

  return localBuild;
}
