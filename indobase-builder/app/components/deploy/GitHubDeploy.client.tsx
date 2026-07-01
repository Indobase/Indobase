import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { path } from '~/utils/path';
import { useState } from 'react';
import { chatId } from '~/lib/persistence/useChatHistory';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import { runDeployBuildStep } from '~/lib/deploy/runDeployBuild';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import { formatBuildFailureOutput } from './deployUtils';

export function useGitHubDeploy() {
  const [isDeploying, setIsDeploying] = useState(false);
  const currentChatId = useStore(chatId);

  const handleGitHubDeploy = async () => {
    const connection = getLocalStorage('github_connection');

    if (!connection?.token || !connection?.user) {
      toast.error('Please connect your GitHub account in Settings > Connections first');
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

      // Create a deployment artifact for visual feedback
      const deploymentId = `deploy-github-project`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: 'GitHub Deployment',
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      // Notify that build is starting
      deployArtifact.runner.handleDeployAction('building', 'running', { source: 'github' });

      const buildResult = await runDeployBuildStep(indobaseConnection.get());

      if (!buildResult.success) {
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildResult.error),
          source: 'github',
        });
        throw new Error('Build failed');
      }

      deployArtifact.runner.handleDeployAction('deploying', 'running', {
        source: 'github',
      });

      const container = await webcontainer;

      // Get all files recursively - we'll deploy the entire project, not just the build directory
      async function getAllFiles(dirPath: string, basePath: string = ''): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        const entries = await container.fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          // Create a relative path without the leading slash for GitHub
          const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

          // Skip node_modules, .git directories and other common excludes
          if (
            entry.isDirectory() &&
            (entry.name === 'node_modules' ||
              entry.name === '.git' ||
              entry.name === 'dist' ||
              entry.name === 'build' ||
              entry.name === '.cache' ||
              entry.name === '.next')
          ) {
            continue;
          }

          if (entry.isFile()) {
            // Skip binary files, large files and other common excludes
            if (entry.name.endsWith('.DS_Store') || entry.name.endsWith('.log') || entry.name.startsWith('.env')) {
              continue;
            }

            try {
              const content = await container.fs.readFile(fullPath, 'utf-8');

              // Store the file with its relative path, not the full system path
              files[relativePath] = content;
            } catch (error) {
              console.warn(`Could not read file ${fullPath}:`, error);
              continue;
            }
          } else if (entry.isDirectory()) {
            const subFiles = await getAllFiles(fullPath, relativePath);
            Object.assign(files, subFiles);
          }
        }

        return files;
      }

      const fileContents = await getAllFiles('/');

      /*
       * Show GitHub deployment dialog here - it will handle the actual deployment
       * and will receive these files to deploy
       */

      /*
       * For now, we'll just complete the deployment with a success message
       * Notify that deployment preparation is complete
       */
      deployArtifact.runner.handleDeployAction('deploying', 'complete', {
        source: 'github',
      });

      return {
        success: true,
        files: fileContents,
        projectName: artifact.title || 'indobase-project',
      };
    } catch (err) {
      console.error('GitHub deploy error:', err);
      toast.error(err instanceof Error ? err.message : 'GitHub deployment preparation failed');

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleGitHubDeploy,
    isConnected: !!getLocalStorage('github_connection')?.user,
  };
}
