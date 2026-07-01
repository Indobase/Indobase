import { runDeployBuildStep } from '~/lib/deploy/runDeployBuild';
import { ensureBuilderSession, getStoredSupabaseConnection } from '~/lib/indobase/builder-auth.client';
import {
  canQueueIndobaseDeployment,
  publishIndobaseDeployment,
  type IndobaseDeployment,
  type QueueDeploymentResult,
} from '~/lib/indobase/studioApi';
import { runStudioBackendPreflight } from '~/lib/indobase/studioPreflight';
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

  await ensureBuilderSession();
  const activeConnection = getStoredSupabaseConnection() ?? connection;

  if (!canQueueIndobaseDeployment(activeConnection)) {
    return {
      success: false,
      error: 'Connect from Indobase Studio to publish to your subdomain.',
      status: 401,
    };
  }

  const preflight = await runStudioBackendPreflight(activeConnection);

  if (!preflight.success || !preflight.ready) {
    return {
      success: false,
      error:
        preflight.error ||
        (preflight.projectStatus === 'INACTIVE'
          ? 'Project is paused in Studio. Restore it before publishing.'
          : 'Project backend is not ready. Open Studio to repair the data plane, then retry.'),
      status: preflight.status || 503,
    };
  }

  const buildResult = await runDeployBuildStep(activeConnection);

  if (!buildResult.success || !buildResult.files) {
    return {
      success: false,
      error: buildResult.error || 'Build failed before publish.',
    };
  }

  const result = await publishIndobaseDeployment(
    activeConnection,
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
