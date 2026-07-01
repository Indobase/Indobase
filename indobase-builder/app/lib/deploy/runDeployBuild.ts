import { collectBuildArtifacts } from '~/lib/indobase/collectBuildArtifacts';
import type { CollectBuildArtifactsResult } from '~/lib/indobase/collectBuildArtifacts';
import { resolveProjectBuild } from '~/lib/indobase/resolveProjectBuild';
import { canQueueIndobaseDeployment } from '~/lib/indobase/studioApi';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import { workbenchStore } from '~/lib/stores/workbench';

export type DeployBuildStepResult = CollectBuildArtifactsResult & {
  usedServerBuild: boolean;
};

/**
 * Shared pre-deploy build used by Publish, GitHub/GitLab, and legacy host deploy hooks.
 * Prefers server-side build when launched from Studio; falls back to WebContainer.
 */
export async function runDeployBuildStep(
  connection?: IndobaseConnectionState | null,
): Promise<DeployBuildStepResult> {
  const studioLinked = canQueueIndobaseDeployment(connection);

  if (studioLinked && connection) {
    const serverResult = await resolveProjectBuild({
      connection,
      files: workbenchStore.files.get(),
    });

    return { ...serverResult, usedServerBuild: serverResult.success };
  }

  const localResult = await collectBuildArtifacts();

  return { ...localResult, usedServerBuild: false };
}
