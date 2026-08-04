import { AnimatePresence, motion } from 'framer-motion';
import { memo, useMemo, useState } from 'react';
import type { ActionState } from '~/lib/runtime/action-runner';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

/**
 * Agent-phase progress view.
 *
 * Replaces the flat "Create file X / Run command Y" stream with the delegation model: named phases,
 * each attributed to an agent, with a human-readable summary of what happened.
 *
 * The difference is intent, not decoration. A flat action log reads as "watch the machine type" —
 * it asks the user to follow along with implementation detail (file paths, npm commands) they did
 * not ask for and mostly cannot judge. Grouping the same stream into phases reads as "a team is
 * building this for you": the user tracks *progress*, and drops into detail only when they want it.
 *
 * No new data is required — this derives entirely from the existing action stream, so it cannot
 * drift from what the runner is actually doing.
 */

type PhaseId = 'scaffold' | 'dependencies' | 'backend' | 'verify' | 'run';
type PhaseStatus = 'pending' | 'running' | 'complete' | 'failed';

type Phase = {
  id: PhaseId;
  /** Which agent owns this phase — the delegation cue. */
  agent: string;
  label: string;
  icon: string;
  actions: ActionState[];
  status: PhaseStatus;
  summary: string;
};

const PHASE_ORDER: PhaseId[] = ['scaffold', 'dependencies', 'backend', 'verify', 'run'];

const PHASE_META: Record<PhaseId, { agent: string; label: string; icon: string }> = {
  scaffold: { agent: 'Builder', label: 'Delegated to Builder', icon: 'i-ph:code-block' },
  dependencies: { agent: 'Builder', label: 'Installing packages', icon: 'i-ph:package' },
  backend: { agent: 'Backend', label: 'Delegated to Backend', icon: 'i-ph:database' },
  verify: { agent: 'Quality', label: 'Checking it builds', icon: 'i-ph:check-circle' },
  run: { agent: 'Preview', label: 'Starting preview', icon: 'i-ph:play-circle' },
};

/** Shell commands that are dependency installs rather than app work. */
const INSTALL_RE = /\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b/;

function phaseOf(action: ActionState): PhaseId {
  switch (action.type) {
    case 'file':
      return 'scaffold';
    case 'indobase':
      return 'backend';
    case 'build':
      return 'verify';
    case 'start':
      return 'run';
    case 'shell':
      return INSTALL_RE.test(action.content ?? '') ? 'dependencies' : 'verify';
    default:
      return 'scaffold';
  }
}

/**
 * A phase is failed if anything in it failed, running if anything is still going, complete only when
 * every action resolved. `start` actions run indefinitely by design (the dev server), so a running
 * start counts as complete — otherwise the preview phase would spin forever.
 */
function statusOf(actions: ActionState[]): PhaseStatus {
  if (actions.some((a) => a.status === 'failed')) return 'failed';

  const settled = actions.every(
    (a) =>
      a.status === 'complete' ||
      a.status === 'aborted' ||
      a.status === 'failed' ||
      (a.type === 'start' && a.status === 'running'),
  );

  if (settled) return 'complete';

  return actions.some((a) => a.status === 'running') ? 'running' : 'pending';
}

/** Plain-language summary — what a non-developer would want to know happened. */
function summarize(id: PhaseId, actions: ActionState[], status: PhaseStatus): string {
  const n = actions.length;

  if (status === 'failed') {
    const failed = actions.find((a) => a.status === 'failed');
    return failed?.type === 'file' ? 'Some files could not be written' : 'A step did not complete';
  }

  switch (id) {
    case 'scaffold': {
      const files = actions.filter((a) => a.type === 'file').length;
      if (status === 'complete') return `${files} file${files === 1 ? '' : 's'} written`;
      return `Writing ${files} file${files === 1 ? '' : 's'}…`;
    }
    case 'dependencies':
      return status === 'complete' ? 'Packages installed' : 'Installing packages…';
    case 'backend':
      return status === 'complete' ? 'Backend connected' : 'Connecting the backend…';
    case 'verify':
      return status === 'complete' ? 'Build checks passed' : 'Running build checks…';
    case 'run':
      return status === 'complete' ? 'Preview is live' : 'Starting the preview…';
    default:
      return `${n} step${n === 1 ? '' : 's'}`;
  }
}

/** Group the flat action stream into ordered phases, dropping phases with no work in them. */
export function buildPhases(actions: ActionState[]): Phase[] {
  const groups = new Map<PhaseId, ActionState[]>();

  for (const action of actions) {
    const id = phaseOf(action);
    const list = groups.get(id);

    if (list) {
      list.push(action);
    } else {
      groups.set(id, [action]);
    }
  }

  return PHASE_ORDER.filter((id) => groups.has(id)).map((id) => {
    const phaseActions = groups.get(id)!;
    const status = statusOf(phaseActions);

    return {
      id,
      ...PHASE_META[id],
      actions: phaseActions,
      status,
      summary: summarize(id, phaseActions, status),
    };
  });
}

function StatusDot({ status }: { status: PhaseStatus }) {
  if (status === 'running') {
    return <div className="i-svg-spinners:90-ring-with-bg text-base text-bolt-elements-loader-progress" />;
  }

  if (status === 'complete') {
    return <div className="i-ph:check-circle-fill text-base text-bolt-elements-icon-success" />;
  }

  if (status === 'failed') {
    return <div className="i-ph:x-circle-fill text-base text-bolt-elements-button-danger-text" />;
  }

  return <div className="i-ph:circle text-base text-bolt-elements-textTertiary" />;
}

/** One action rendered as a readable line rather than a raw command. */
function actionLabel(action: ActionState): string {
  if (action.type === 'file') {
    return (action as ActionState & { filePath?: string }).filePath ?? 'file';
  }

  if (action.type === 'start') {
    return 'Start dev server';
  }

  const content = (action.content ?? '').trim().split('\n')[0];

  return content.length > 80 ? `${content.slice(0, 80)}…` : content || action.type;
}

const PhaseRow = memo(({ phase }: { phase: Phase }) => {
  const [open, setOpen] = useState(false);

  return (
    <li className="relative pl-7">
      {/* Timeline rail — the visual cue that these are sequential phases, not a flat list. */}
      <span
        aria-hidden="true"
        className="absolute left-[7px] top-6 bottom-0 w-px bg-bolt-elements-borderColor last:hidden"
      />
      <span className="absolute left-0 top-1">
        <StatusDot status={phase.status} />
      </span>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-baseline gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-bolt-elements-item-backgroundActive"
      >
        <span
          className={classNames('text-sm font-medium', {
            'text-bolt-elements-textPrimary': phase.status !== 'pending',
            'text-bolt-elements-textTertiary': phase.status === 'pending',
          })}
        >
          {phase.label}
        </span>
        {/* Agent attribution — the "who is doing this for me" signal. */}
        <span className="rounded-full bg-bolt-elements-item-backgroundAccent px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-bolt-elements-item-contentAccent">
          {phase.agent}
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs text-bolt-elements-textSecondary">
          {phase.summary}
          <span
            className={classNames(
              'text-bolt-elements-textTertiary transition-transform',
              open ? 'i-ph:caret-up-bold' : 'i-ph:caret-down-bold',
            )}
          />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: cubicEasingFn }}
            className="overflow-hidden"
          >
            {phase.actions.map((action, i) => (
              <li
                key={i}
                className="flex items-center gap-2 py-0.5 pl-1 font-mono text-xs text-bolt-elements-textTertiary"
              >
                <StatusDot status={action.status as PhaseStatus} />
                <span className="truncate">{actionLabel(action)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
});

export const BuildPlan = memo(({ actions }: { actions: ActionState[] }) => {
  const phases = useMemo(() => buildPhases(actions), [actions]);

  if (phases.length === 0) {
    return null;
  }

  const done = phases.filter((p) => p.status === 'complete').length;
  const failed = phases.some((p) => p.status === 'failed');
  const allDone = done === phases.length && !failed;

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
          {failed ? 'Build stopped' : allDone ? 'Build complete' : 'Building your app'}
        </span>
        <span className="text-xs text-bolt-elements-textTertiary">
          {done}/{phases.length}
        </span>
        {/* Compact progress bar: progress at a glance without reading any step. */}
        <span className="ml-auto h-1 w-24 overflow-hidden rounded-full bg-bolt-elements-borderColor">
          <motion.span
            className={classNames(
              'block h-full rounded-full',
              failed ? 'bg-bolt-elements-button-danger-text' : 'bg-bolt-elements-loader-progress',
            )}
            initial={{ width: 0 }}
            animate={{ width: `${(done / phases.length) * 100}%` }}
            transition={{ duration: 0.3, ease: cubicEasingFn }}
          />
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {phases.map((phase) => (
          <PhaseRow key={phase.id} phase={phase} />
        ))}
      </ul>
    </div>
  );
});
