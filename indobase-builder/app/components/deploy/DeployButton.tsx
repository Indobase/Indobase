import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { isGitLabConnected } from '~/lib/stores/gitlabConnection';
import { supabaseConnection } from '~/lib/stores/supabase';
import { workbenchStore } from '~/lib/stores/workbench';
import { streamingState } from '~/lib/stores/streaming';
import { classNames } from '~/utils/classNames';
import { useState } from 'react';
import { useGitHubDeploy } from '~/components/deploy/GitHubDeploy.client';
import { useGitLabDeploy } from '~/components/deploy/GitLabDeploy.client';
import { runOneClickDeploy } from '~/lib/deploy/runOneClickDeploy';
import {
  getStudioProjectCustomDomainsUrl,
  getStudioProjectHostingUrl,
  getStudioProjectMobileBuildsUrl,
  getStudioProjectRootUrl,
} from '~/lib/indobase/studioLinks';
import {
  canQueueIndobaseDeployment,
  canQueueIndobaseMobileBuild,
  queueIndobaseMobileBuild,
} from '~/lib/indobase/studioApi';
import { collectMobileBuildSourceFromWorkbench } from '~/lib/indobase/collectMobileBuildSource';
import { chatId } from '~/lib/persistence/useChatHistory';

interface DeployButtonProps {
  onGitHubDeploy?: () => Promise<void>;
  onGitLabDeploy?: () => Promise<void>;
}

export const DeployButton = ({ onGitHubDeploy, onGitLabDeploy }: DeployButtonProps) => {
  const backendConnection = useStore(supabaseConnection);
  const currentChatId = useStore(chatId);
  const gitlabIsConnected = useStore(isGitLabConnected);
  const isStreaming = useStore(streamingState);
  const { handleGitHubDeploy } = useGitHubDeploy();
  const { handleGitLabDeploy } = useGitLabDeploy();
  const isStudioManagedConnection = backendConnection.connectionSource === 'studio_handoff';
  const studioUrl = backendConnection.indobase?.studioUrl || 'https://studio.indobase.in';
  const projectRootUrl = getStudioProjectRootUrl(backendConnection, backendConnection.selectedProjectId);
  const hostingUrl = getStudioProjectHostingUrl(backendConnection, backendConnection.selectedProjectId);
  const customDomainsUrl = getStudioProjectCustomDomainsUrl(backendConnection, backendConnection.selectedProjectId);
  const mobileBuildsUrl = getStudioProjectMobileBuildsUrl(backendConnection, backendConnection.selectedProjectId);
  const canPublishIndobase = canQueueIndobaseDeployment(backendConnection);
  const [isDeploying, setIsDeploying] = useState(false);
  const [, setDeployingTo] = useState<'indobase' | 'github' | 'gitlab' | null>(null);
  const deployDisabled = isDeploying || isStreaming;

  const openIndobaseUrl = (url: string | null, errorMessage: string) => {
    if (!url) {
      toast.error(errorMessage);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleIndobaseDeployClick = async () => {
    if (!canPublishIndobase) {
      if (!hostingUrl) {
        toast.info('Open Studio to choose a project and continue with Indobase hosting.');
      }

      openIndobaseUrl(hostingUrl || studioUrl, 'Could not open Indobase Studio hosting right now. Please try again.');
      return;
    }

    setIsDeploying(true);
    setDeployingTo('indobase');

    try {
      await runOneClickDeploy('indobase', {
        chatId: currentChatId,
        connection: backendConnection,
      });
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleConnectDomainClick = () => {
    if (!customDomainsUrl) {
      toast.info('Open Studio to pick a project before connecting a custom domain.');
    }

    openIndobaseUrl(
      customDomainsUrl || studioUrl,
      'Could not open Indobase domain settings right now. Please try again.',
    );
  };

  const handleAndroidBundleClick = async () => {
    if (canQueueIndobaseMobileBuild(backendConnection)) {
      setIsDeploying(true);
      setDeployingTo('indobase');

      try {
        const sourceResult = collectMobileBuildSourceFromWorkbench();

        if (!sourceResult.success) {
          toast.error(sourceResult.error);
          return;
        }

        const result = await queueIndobaseMobileBuild(backendConnection, {
          framework: 'expo',
          profile: 'production',
          target: 'android_aab',
          sourceFiles: sourceResult.files,
          metadata: {
            source: 'deploy_menu',
            staged_from: 'builder_workbench',
          },
        });

        if (result.success) {
          toast.success('Android bundle build queued. Track progress in Studio.');
        } else if (result.status === 409) {
          toast.info(result.error || 'A build is already in progress. Opening Studio status…');
        } else {
          toast.error(result.error || 'Could not queue Android bundle build.');
        }

        openIndobaseUrl(
          mobileBuildsUrl || studioUrl,
          'Could not open Indobase Android bundle builds right now. Please try again.',
        );
      } finally {
        setIsDeploying(false);
        setDeployingTo(null);
      }

      return;
    }

    if (!mobileBuildsUrl) {
      toast.info('Open Studio to pick a project before requesting an Android bundle build.');
    }

    openIndobaseUrl(
      mobileBuildsUrl || studioUrl,
      'Could not open Indobase Android bundle builds right now. Please try again.',
    );
  };

  const handleGitHubDeployClick = async () => {
    setIsDeploying(true);
    setDeployingTo('github');

    try {
      if (onGitHubDeploy) {
        await onGitHubDeploy();
        return;
      }

      const prepared = await handleGitHubDeploy();

      if (!prepared || prepared === false || !prepared.success || !prepared.files) {
        return;
      }

      await runOneClickDeploy('github', {
        chatId: currentChatId,
        connection: backendConnection,
        files: prepared.files,
        projectName: prepared.projectName,
      });
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleGitLabDeployClick = async () => {
    setIsDeploying(true);
    setDeployingTo('gitlab');

    try {
      if (onGitLabDeploy) {
        await onGitLabDeploy();
        return;
      }

      const prepared = await handleGitLabDeploy();

      if (!prepared || prepared === false || !prepared.success || !prepared.files) {
        return;
      }

      await runOneClickDeploy('gitlab', {
        chatId: currentChatId,
        connection: backendConnection,
        files: prepared.files,
        projectName: prepared.projectName,
      });
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const primaryLabel = isDeploying
    ? `Publishing…`
    : canPublishIndobase
      ? 'Publish'
      : isStudioManagedConnection
        ? 'Publish'
        : 'Deploy';

  return (
    <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden text-sm">
      <button
        type="button"
        disabled={deployDisabled}
        onClick={() => void handleIndobaseDeployClick()}
        className="items-center justify-center [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-60 px-3 py-1.5 text-xs bg-accent-500 text-white hover:text-bolt-elements-item-contentAccent [&:not(:disabled,.disabled)]:hover:bg-bolt-elements-button-primary-backgroundHover outline-accent-500 flex gap-1.5 border-r border-bolt-elements-borderColor"
      >
        <div className="i-ph:rocket-launch" />
        <span>{primaryLabel}</span>
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          disabled={deployDisabled}
          className="rounded-md items-center justify-center [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-60 px-2 py-1.5 text-xs bg-accent-500 text-white hover:text-bolt-elements-item-contentAccent [&:not(:disabled,.disabled)]:hover:bg-bolt-elements-button-primary-backgroundHover outline-accent-500 flex"
          aria-label="More deploy options"
        >
          <span className={classNames('i-ph:caret-down transition-transform')} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className={classNames(
            'z-[250]',
            'bg-bolt-elements-background-depth-2',
            'rounded-lg shadow-lg',
            'border border-bolt-elements-borderColor',
            'animate-in fade-in-0 zoom-in-95',
            'py-1',
          )}
          sideOffset={5}
          align="end"
        >
          <DropdownMenu.Item
            className={classNames(
              'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
            )}
            onClick={() => void handleIndobaseDeployClick()}
          >
            <div className="i-ph:rocket-launch w-5 h-5 text-[#FFC107]" />
            <span className="mx-auto">Publish to Indobase subdomain</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
            )}
            onClick={handleConnectDomainClick}
          >
            <div className="i-ph:globe-hemisphere-west w-5 h-5 text-[#3ECF8E]" />
            <span className="mx-auto">
              {customDomainsUrl ? 'Connect your custom domain' : 'Open Studio for custom domains'}
            </span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
            )}
            onClick={() => void handleAndroidBundleClick()}
          >
            <div className="i-ph:android-logo w-5 h-5 text-[#34A853]" />
            <span className="mx-auto">
              {canQueueIndobaseMobileBuild(backendConnection)
                ? 'Build Android bundle (web + mobile)'
                : mobileBuildsUrl
                  ? 'Build Android bundle'
                  : 'Open Studio for Android builds'}
            </span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
            )}
            onClick={() => void handleGitHubDeployClick()}
          >
            <img
              className="w-5 h-5"
              height="24"
              width="24"
              crossOrigin="anonymous"
              src="https://cdn.simpleicons.org/github"
              alt="github"
            />
            <span className="mx-auto">Deploy to GitHub</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive gap-2 rounded-md group relative',
              {
                'opacity-60 cursor-not-allowed': !gitlabIsConnected,
              },
            )}
            disabled={!gitlabIsConnected}
            onClick={() => void handleGitLabDeployClick()}
          >
            <img
              className="w-5 h-5"
              height="24"
              width="24"
              crossOrigin="anonymous"
              src="https://cdn.simpleicons.org/gitlab"
              alt="gitlab"
            />
            <span className="mx-auto">{!gitlabIsConnected ? 'No GitLab Account Connected' : 'Deploy to GitLab'}</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onClick={() => openIndobaseUrl(projectRootUrl || studioUrl, 'Could not open Indobase Studio right now.')}
            className={classNames(
              'flex items-center w-full rounded-md px-4 py-2 text-sm gap-2',
              'cursor-pointer text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive',
            )}
          >
            <div className="i-ph:arrow-square-out w-5 h-5" />
            <span className="mx-auto">
              {projectRootUrl ? 'Open linked Indobase project' : 'Open Indobase Studio'}
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
};
