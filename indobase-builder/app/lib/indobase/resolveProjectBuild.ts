import type { CollectBuildArtifactsResult } from '~/lib/indobase/collectBuildArtifacts';
import { collectBuildArtifacts } from '~/lib/indobase/collectBuildArtifacts';
import { collectBuildArtifactsViaServer } from '~/lib/indobase/requestServerBuild';
import { canQueueIndobaseDeployment } from '~/lib/indobase/studioApi';
import type { FileMap } from '~/lib/stores/files';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

export async function resolveProjectBuild(options: {
  connection: IndobaseConnectionState;
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
