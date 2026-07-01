import { resolveProjectBuild } from '~/lib/indobase/resolveProjectBuild';
import {
  canQueueIndobaseDeployment,
  publishIndobaseDeployment,
  type QueueDeploymentResult,
} from '~/lib/indobase/studioApi';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';
import { workbenchStore } from '~/lib/stores/workbench';

export type PublishToIndobaseResult = QueueDeploymentResult & {
  openedUrl?: string;
};

export async function publishToIndobase(
  connection: SupabaseConnectionState,
  metadata: Record<string, unknown> = { source: 'one_click_deploy' },
): Promise<PublishToIndobaseResult> {
  if (!canQueueIndobaseDeployment(connection)) {
    return {
      success: false,
      error: 'Connect from Indobase Studio to publish to your subdomain.',
    };
  }

  const buildResult = await resolveProjectBuild({
    connection,
    files: workbenchStore.files.get(),
  });

  if (!buildResult.success || !buildResult.files) {
    return {
      success: false,
      error: buildResult.error || 'Build failed before publish.',
    };
  }

  const result = await publishIndobaseDeployment(connection, {
    artifacts: buildResult.files,
    metadata,
  });

  if (result.success && result.deployment?.target_url) {
    return {
      ...result,
      openedUrl: result.deployment.target_url,
    };
  }

  return result;
}
