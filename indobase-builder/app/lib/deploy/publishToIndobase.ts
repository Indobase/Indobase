import { runDeployBuildStep } from '~/lib/deploy/runDeployBuild';
import {
  canQueueIndobaseDeployment,
  publishIndobaseDeployment,
  type IndobaseDeployment,
  type QueueDeploymentResult,
} from '~/lib/indobase/studioApi';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';

export type PublishToIndobaseResult = QueueDeploymentResult & {
  openedUrl?: string;
};

export type PublishToIndobaseOptions = {
  metadata?: Record<string, unknown>;
  onDeploymentStatus?: (deployment: IndobaseDeployment) => void;
};

export async function publishToIndobase(
  connection: SupabaseConnectionState,
  options: PublishToIndobaseOptions = {},
): Promise<PublishToIndobaseResult> {
  const metadata = options.metadata ?? { source: 'one_click_deploy' };

  if (!canQueueIndobaseDeployment(connection)) {
    return {
      success: false,
      error: 'Connect from Indobase Studio to publish to your subdomain.',
    };
  }

  const buildResult = await runDeployBuildStep(connection);

  if (!buildResult.success || !buildResult.files) {
    return {
      success: false,
      error: buildResult.error || 'Build failed before publish.',
    };
  }

  const result = await publishIndobaseDeployment(
    connection,
    {
      artifacts: buildResult.files,
      metadata,
    },
    {
      onStatus: options.onDeploymentStatus,
    },
  );

  if (result.success && result.deployment?.target_url) {
    return {
      ...result,
      openedUrl: result.deployment.target_url,
    };
  }

  return result;
}
