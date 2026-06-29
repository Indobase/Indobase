import { useSearchParams } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

import { useGitHubDeploy } from '~/components/deploy/GitHubDeploy.client';
import { useGitLabDeploy } from '~/components/deploy/GitLabDeploy.client';
import { runOneClickDeploy, type OneClickDeployTarget } from '~/lib/deploy/runOneClickDeploy';
import { chatId } from '~/lib/persistence/useChatHistory';
import { supabaseConnection } from '~/lib/stores/supabase';
import { workbenchStore } from '~/lib/stores/workbench';

const VALID_TARGETS = new Set<OneClickDeployTarget>(['indobase', 'github', 'gitlab']);

export function usePendingDeploy() {
  const [searchParams, setSearchParams] = useSearchParams();
  const connection = useStore(supabaseConnection);
  const currentChatId = useStore(chatId);
  const startedRef = useRef(false);
  const { handleGitHubDeploy } = useGitHubDeploy();
  const { handleGitLabDeploy } = useGitLabDeploy();

  useEffect(() => {
    const deployTarget = searchParams.get('deploy');

    if (!deployTarget || !VALID_TARGETS.has(deployTarget as OneClickDeployTarget) || startedRef.current) {
      return;
    }

    const clearDeployParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('deploy');
      setSearchParams(next, { replace: true });
    };

    const timer = window.setTimeout(async () => {
      if (!workbenchStore.firstArtifact) {
        toast.info('Build your app in Builder, then use Deploy to publish.');
        clearDeployParam();
        return;
      }

      startedRef.current = true;

      try {
        let files: Record<string, string> | undefined;
        let projectName: string | undefined;

        if (deployTarget === 'github') {
          const prepared = await handleGitHubDeploy();

          if (!prepared || prepared === false || !prepared.success || !prepared.files) {
            clearDeployParam();
            return;
          }

          files = prepared.files;
          projectName = prepared.projectName;
        }

        if (deployTarget === 'gitlab') {
          const prepared = await handleGitLabDeploy();

          if (!prepared || prepared === false || !prepared.success || !prepared.files) {
            clearDeployParam();
            return;
          }

          files = prepared.files;
          projectName = prepared.projectName;
        }

        await runOneClickDeploy(deployTarget as OneClickDeployTarget, {
          chatId: currentChatId,
          connection,
          files,
          projectName,
        });
      } finally {
        clearDeployParam();
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [
    connection,
    currentChatId,
    handleGitHubDeploy,
    handleGitLabDeploy,
    searchParams,
    setSearchParams,
  ]);
}
