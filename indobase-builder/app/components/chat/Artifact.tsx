import { useStore } from '@nanostores/react';
import { memo, useEffect, useRef, useState } from 'react';
import type { ActionState } from '~/lib/runtime/action-runner';
import { workbenchStore } from '~/lib/stores/workbench';
import { BuildPlan } from './BuildPlan';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';
import { atom, computed } from 'nanostores';

/** Stable empty map so hooks stay valid when an artifact id is missing from the store. */
const EMPTY_ACTIONS = atom<Record<string, ActionState>>({});

interface ArtifactProps {
  messageId: string;
  artifactId: string;
}

export const Artifact = memo(({ artifactId }: ArtifactProps) => {
  const userToggledActions = useRef(false);
  const [showActions, setShowActions] = useState(true);
  const [allActionFinished, setAllActionFinished] = useState(false);
  const [stalledImport, setStalledImport] = useState(false);

  const artifacts = useStore(workbenchStore.artifacts);
  const artifact = artifacts[artifactId];

  const actions = useStore(
    computed(artifact?.runner.actions ?? EMPTY_ACTIONS, (actions) => {
      return Object.values(actions).filter((action) => {
        return action.type !== 'indobase';
      });
    }),
  );

  const toggleActions = () => {
    userToggledActions.current = true;
    setShowActions(!showActions);
  };

  useEffect(() => {
    if (!artifact) {
      return;
    }

    if (actions.length && !showActions && !userToggledActions.current) {
      setShowActions(true);
    }

    if (actions.length !== 0 && artifact.type === 'bundled') {
      const finished = !actions.find((action) => {
        if (action.status === 'complete' || action.status === 'failed' || action.status === 'aborted') {
          return false;
        }

        return !(action.type === 'start' && action.status === 'running');
      });

      if (allActionFinished !== finished) {
        setAllActionFinished(finished);
      }
    }
  }, [actions, artifact, allActionFinished, showActions]);

  useEffect(() => {
    if (artifact?.type !== 'bundled' || allActionFinished || actions.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const stalled = actions.some(
        (action) =>
          action.status !== 'complete' &&
          action.status !== 'failed' &&
          action.status !== 'aborted' &&
          !(action.type === 'start' && action.status === 'running'),
      );

      if (stalled) {
        setAllActionFinished(true);
        setStalledImport(true);
      }
    }, 45_000);

    return () => window.clearTimeout(timeout);
  }, [actions, allActionFinished, artifact?.type]);

  if (!artifact) {
    return (
      <div className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
        Project files unavailable — reopen this chat or refresh the page.
      </div>
    );
  }

  if (artifact.type === 'bundled') {
    return (
      <div className="w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className={classNames('text-lg', getIconColor(allActionFinished ? 'complete' : 'running'))}>
            {allActionFinished ? (
              <div className="i-ph:check-circle-fill" />
            ) : (
              <div className="i-svg-spinners:90-ring-with-bg" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900">
              {allActionFinished
                ? stalledImport
                  ? 'Import timed out — open Manage or refresh'
                  : actions.some((action) => action.status === 'failed')
                    ? 'Some files could not be created'
                    : artifact.id === 'restored-project-setup'
                      ? 'Project restored'
                      : 'Project files ready'
                : artifact.id === 'restored-project-setup'
                  ? 'Restoring project…'
                  : 'Creating project files…'}
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[#2F6FED] hover:bg-[#EAF2FF]"
            onClick={() => workbenchStore.showWorkbench.set(true)}
          >
            Open preview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {actions.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={toggleActions}
            className="mb-1.5 flex w-full items-center gap-2 px-1 text-left text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            <span>{showActions ? 'Hide details' : 'Show progress'}</span>
            <span className={showActions ? 'i-ph:caret-up-bold' : 'i-ph:caret-down-bold'} />
          </button>
          {showActions && <BuildPlan actions={actions} />}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
          {artifact.title || 'Working on your project'}
        </div>
      )}
    </div>
  );
});

export function openArtifactInWorkbench(filePath: any) {
  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

function getIconColor(status: ActionState['status']) {
  switch (status) {
    case 'pending': {
      return 'text-gray-400';
    }
    case 'running': {
      return 'text-[#2F6FED]';
    }
    case 'complete': {
      return 'text-emerald-500';
    }
    case 'aborted': {
      return 'text-gray-500';
    }
    case 'failed': {
      return 'text-rose-500';
    }
    default: {
      return undefined;
    }
  }
}
