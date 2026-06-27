import { toast } from 'react-toastify';

import { publishToIndobase } from '~/lib/deploy/publishToIndobase';
import { quickGitHubDeploy } from '~/lib/deploy/quickGitHubDeploy';
import { quickGitLabDeploy } from '~/lib/deploy/quickGitLabDeploy';
import { getStudioProjectHostingUrl } from '~/lib/indobase/studioLinks';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';
import { workbenchStore } from '~/lib/stores/workbench';
import { useGitHubDeploy } from '~/components/deploy/GitHubDeploy.client';
import { useGitLabDeploy } from '~/components/deploy/GitLabDeploy.client';

export type OneClickDeployTarget = 'indobase' | 'github' | 'gitlab';

export type OneClickDeployContext = {
  chatId?: string | null;
  connection: SupabaseConnectionState;
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
      const result = await publishToIndobase(context.connection, { source: 'one_click_deploy' });

      if (result.success && result.openedUrl) {
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
        toast.error(result.error || 'Could not publish to Indobase.');
      }

      const fallback = hostingUrl || studioUrl;
      if (fallback) {
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
        toast.success('Pushed to GitHub.');
        window.open(result.repoUrl, '_blank', 'noopener,noreferrer');
        return true;
      }

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
        toast.success('Pushed to GitLab.');
        window.open(result.repoUrl, '_blank', 'noopener,noreferrer');
        return true;
      }

      toast.error(result.error || 'GitLab deploy failed.');
      return false;
    }

    default:
      return false;
  }
}
