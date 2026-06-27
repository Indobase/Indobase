import { collectBuildArtifacts } from '~/lib/indobase/collectBuildArtifacts';
import {
  canQueueIndobaseDeployment,
  publishIndobaseDeployment,
  type QueueDeploymentResult,
} from '~/lib/indobase/studioApi';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

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

  const buildResult = await collectBuildArtifacts();

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
