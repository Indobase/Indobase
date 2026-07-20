import { toast } from 'react-toastify';

import { capturePostHogEvent } from '~/lib/analytics/posthog.client';
import { publishToIndobase } from '~/lib/deploy/publishToIndobase';
import { quickGitHubDeploy } from '~/lib/deploy/quickGitHubDeploy';
import { quickGitLabDeploy } from '~/lib/deploy/quickGitLabDeploy';
import { getStudioProjectHostingUrl } from '~/lib/indobase/studioLinks';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import { workbenchStore } from '~/lib/stores/workbench';

export type OneClickDeployTarget = 'indobase' | 'github' | 'gitlab';

export type OneClickDeployContext = {
  chatId?: string | null;
  connection: IndobaseConnectionState;
  files?: Record<string, string>;
  projectName?: string;
};

export async function runOneClickDeploy(
  target: OneClickDeployTarget,
  context: OneClickDeployContext,
): Promise<boolean> {
  const hostingUrl = getStudioProjectHostingUrl(context.connection, context.connection.selectedProjectId);
  const studioUrl = context.connection.indobase?.studioUrl || 'https://studio.indobase.in';

  switch (target) {
    case 'indobase': {
      const result = await publishToIndobase(context.connection, {
        metadata: { source: 'one_click_deploy' },
        onDeploymentStatus: (deployment) => {
          if (deployment.status === 'building') {
            toast.info('Publishing build to your Indobase subdomain…');
          } else if (deployment.status === 'ready' && deployment.target_url) {
            toast.success(`Live at ${deployment.target_url}`);
          } else if (deployment.status === 'failed') {
            toast.error(deployment.last_error || 'Deployment failed.');
          }
        },
      });

      if (result.success && result.openedUrl) {
        capturePostHogEvent('builder_deploy_succeeded', {
          target: 'indobase',
          project_ref: context.connection.selectedProjectId,
          source: metadata.source,
        });
        toast.success('Published on your Indobase subdomain.');
        window.open(result.openedUrl, '_blank', 'noopener,noreferrer');
        return true;
      }

      if (result.status === 409) {
        toast.info(result.error || 'A deployment is already in progress.');
      } else if (result.status === 408 && result.deployment?.target_url) {
        toast.info(result.error || 'Deployment is still running.');
        window.open(result.deployment.target_url, '_blank', 'noopener,noreferrer');
        return true;
      } else {
        capturePostHogEvent('builder_deploy_failed', {
          target: 'indobase',
          project_ref: context.connection.selectedProjectId,
          status: result.status,
          source: metadata.source,
        });
        toast.error(result.error || 'Could not publish to Indobase.');
      }

      const fallback = hostingUrl || studioUrl;
      if (fallback && (result.status === 401 || result.error?.includes('Connect from Indobase Studio'))) {
        window.open(fallback, '_blank', 'noopener,noreferrer');
      }

      return false;
    }

    case 'github': {
      const files = context.files;
      const projectName = context.projectName || workbenchStore.firstArtifact?.title || 'indobase-project';

      if (!files) {
        toast.error('Build the project before deploying to GitHub.');
        return false;
      }

      const result = await quickGitHubDeploy({
        chatId: context.chatId,
        files,
        projectName,
      });

      if (result.success && result.repoUrl) {
        capturePostHogEvent('builder_deploy_succeeded', {
          target: 'github',
          project_ref: context.connection.selectedProjectId,
        });
        toast.success('Pushed to GitHub.');
        window.open(result.repoUrl, '_blank', 'noopener,noreferrer');
        return true;
      }

      capturePostHogEvent('builder_deploy_failed', {
        target: 'github',
        project_ref: context.connection.selectedProjectId,
      });
      toast.error(result.error || 'GitHub deploy failed.');
      return false;
    }

    case 'gitlab': {
      const files = context.files;
      const projectName = context.projectName || workbenchStore.firstArtifact?.title || 'indobase-project';

      if (!files) {
        toast.error('Build the project before deploying to GitLab.');
        return false;
      }

      const result = await quickGitLabDeploy({
        chatId: context.chatId,
        files,
        projectName,
      });

      if (result.success && result.repoUrl) {
        capturePostHogEvent('builder_deploy_succeeded', {
          target: 'gitlab',
          project_ref: context.connection.selectedProjectId,
        });
        toast.success('Pushed to GitLab.');
        window.open(result.repoUrl, '_blank', 'noopener,noreferrer');
        return true;
      }

      capturePostHogEvent('builder_deploy_failed', {
        target: 'gitlab',
        project_ref: context.connection.selectedProjectId,
      });
      toast.error(result.error || 'GitLab deploy failed.');
      return false;
    }

    default:
      return false;
  }
}
