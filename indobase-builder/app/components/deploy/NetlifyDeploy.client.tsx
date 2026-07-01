import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { netlifyConnection } from '~/lib/stores/netlify';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import { workbenchStore } from '~/lib/stores/workbench';
import { useState } from 'react';
import { chatId } from '~/lib/persistence/useChatHistory';
import { formatBuildFailureOutput } from './deployUtils';
import { runDeployBuildStep } from '~/lib/deploy/runDeployBuild';

export function useNetlifyDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);
  const netlifyConn = useStore(netlifyConnection);
  const backendConnection = useStore(indobaseConnection);
  const currentChatId = useStore(chatId);

  const handleNetlifyDeploy = async () => {
    if (!netlifyConn.user || !netlifyConn.token) {
      toast.error('Please connect to Netlify first in the settings tab!');
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

      const deploymentId = `deploy-artifact`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: 'Netlify Deployment',
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'netlify' });

      const buildResult = await runDeployBuildStep(backendConnection);

      if (!buildResult.success || !buildResult.files) {
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildResult.error),
          source: 'netlify',
        });
        throw new Error(buildResult.error || 'Build failed');
      }

      deployArtifact.runner.handleDeployAction('deploying', 'running', { source: 'netlify' });

      const existingSiteId = localStorage.getItem(`netlify-site-${currentChatId}`);

      const response = await fetch('/api/netlify-deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: existingSiteId || undefined,
          files: buildResult.files,
          token: netlifyConn.token,
          chatId: currentChatId,
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok || !data.deploy || !data.site) {
        console.error('Invalid deploy response:', data);

        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: data.error || 'Invalid deployment response',
          source: 'netlify',
        });
        throw new Error(data.error || 'Invalid deployment response');
      }

      const maxAttempts = 20;
      let attempts = 0;
      let deploymentStatus;

      while (attempts < maxAttempts) {
        try {
          const statusResponse = await fetch(
            `https://api.netlify.com/api/v1/sites/${data.site.id}/deploys/${data.deploy.id}`,
            {
              headers: {
                Authorization: `Bearer ${netlifyConn.token}`,
              },
            },
          );

          deploymentStatus = (await statusResponse.json()) as any;

          if (deploymentStatus.state === 'ready' || deploymentStatus.state === 'uploaded') {
            break;
          }

          if (deploymentStatus.state === 'error') {
            deployArtifact.runner.handleDeployAction('deploying', 'failed', {
              error: 'Deployment failed: ' + (deploymentStatus.error_message || 'Unknown error'),
              source: 'netlify',
            });
            throw new Error('Deployment failed: ' + (deploymentStatus.error_message || 'Unknown error'));
          }

          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error('Status check error:', error);
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      if (attempts >= maxAttempts) {
        deployArtifact.runner.handleDeployAction('deploying', 'failed', {
          error: 'Deployment timed out',
          source: 'netlify',
        });
        throw new Error('Deployment timed out');
      }

      if (data.site) {
        localStorage.setItem(`netlify-site-${currentChatId}`, data.site.id);
      }

      deployArtifact.runner.handleDeployAction('complete', 'complete', {
        url: deploymentStatus.ssl_url || deploymentStatus.url,
        source: 'netlify',
      });

      toast.success(`🚀 Netlify deployment completed successfully!`);

      return true;
    } catch (error) {
      console.error('Deploy error:', error);
      toast.error(error instanceof Error ? error.message : 'Deployment failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleNetlifyDeploy,
    isConnected: !!netlifyConn.user,
  };
}
