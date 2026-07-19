import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import { streamingState } from '~/lib/stores/streaming';
import { classNames } from '~/utils/classNames';
import { useState } from 'react';
import { runOneClickDeploy } from '~/lib/deploy/runOneClickDeploy';
import {
  getStudioProjectCustomDomainsUrl,
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

export const DeployButton = () => {
  const backendConnection = useStore(indobaseConnection);
  const currentChatId = useStore(chatId);
  const isStreaming = useStore(streamingState);
  const isStudioManagedConnection = backendConnection.connectionSource === 'studio_handoff';
  const studioUrl = backendConnection.indobase?.studioUrl || 'https://studio.indobase.in';
  const projectRootUrl = getStudioProjectRootUrl(backendConnection, backendConnection.selectedProjectId);
  const customDomainsUrl = getStudioProjectCustomDomainsUrl(backendConnection, backendConnection.selectedProjectId);
  const mobileBuildsUrl = getStudioProjectMobileBuildsUrl(backendConnection, backendConnection.selectedProjectId);
  const canPublishIndobase = canQueueIndobaseDeployment(backendConnection);
  const [isDeploying, setIsDeploying] = useState(false);
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
      const { redirectToStudioBuilderConnect } = await import('~/lib/indobase/builder-auth.client');
      toast.info('Link your Indobase backend through Studio to publish.');
      redirectToStudioBuilderConnect('/');
      return;
    }

    setIsDeploying(true);

    try {
      await runOneClickDeploy('indobase', {
        chatId: currentChatId,
        connection: backendConnection,
      });
    } finally {
      setIsDeploying(false);
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

  const primaryLabel = isDeploying
    ? 'Publishing…'
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
            <div className="i-ph:rocket-launch w-5 h-5 text-[#3B8FD6]" />
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
