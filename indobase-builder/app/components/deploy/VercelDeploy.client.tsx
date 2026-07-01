import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { vercelConnection } from '~/lib/stores/vercel';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import { workbenchStore } from '~/lib/stores/workbench';
import { useState } from 'react';
import { chatId } from '~/lib/persistence/useChatHistory';
import { formatBuildFailureOutput } from './deployUtils';
import { getDeployEnvironmentVariables } from '~/lib/indobase/deployEnv';
import { runDeployBuildStep } from '~/lib/deploy/runDeployBuild';
import { collectWorkbenchSourceFiles } from '~/lib/indobase/collectWorkbenchSourceFiles';

export function useVercelDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);
  const vercelConn = useStore(vercelConnection);
  const backendConnection = useStore(indobaseConnection);
  const currentChatId = useStore(chatId);

  const handleVercelDeploy = async () => {
    if (!vercelConn.user || !vercelConn.token) {
      toast.error('Please connect to Vercel first in the settings tab!');
      return false;
    }

    if (!currentChatId) {
      toast.error('No active chat found');
      return false;
    }

    try {
      setIsDeploying(true);

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new Error('No active project found');
      }

      const deploymentId = `deploy-vercel-project`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: 'Vercel Deployment',
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'vercel' });

      const buildResult = await runDeployBuildStep(backendConnection);

      if (!buildResult.success || !buildResult.files) {
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildResult.error),
          source: 'vercel',
        });
        throw new Error(buildResult.error || 'Build failed');
      }

      deployArtifact.runner.handleDeployAction('deploying', 'running', { source: 'vercel' });

      const existingProjectId = localStorage.getItem(`vercel-project-${currentChatId}`);
      const environmentVariables = getDeployEnvironmentVariables(backendConnection);

      const response = await fetch('/api/vercel-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: existingProjectId || undefined,
          files: buildResult.files,
          sourceFiles: collectWorkbenchSourceFiles(),
          token: vercelConn.token,
          chatId: currentChatId,
          environmentVariables: Object.keys(environmentVariables).length > 0 ? environmentVariables : undefined,
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok || !data.deploy || !data.project) {
        console.error('Invalid deploy response:', data);

        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: data.error || 'Invalid deployment response',
          source: 'vercel',
        });
        throw new Error(data.error || 'Invalid deployment response');
      }

      if (data.project) {
        localStorage.setItem(`vercel-project-${currentChatId}`, data.project.id);
      }

      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: data.deploy.url,
        source: 'vercel',
      });

      toast.success(`🚀 Vercel deployment completed successfully!`);

      return true;
    } catch (err) {
      console.error('Vercel deploy error:', err);
      toast.error(err instanceof Error ? err.message : 'Vercel deployment failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleVercelDeploy,
    isConnected: !!vercelConn.user,
  };
}
