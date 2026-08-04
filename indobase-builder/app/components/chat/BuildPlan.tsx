import { AnimatePresence, motion } from 'framer-motion';
import { memo, useMemo, useState } from 'react';
import type { ActionState } from '~/lib/runtime/action-runner';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

/**
 * Compact agent-delegation status rows (primary UX).
 * Technical file/command detail stays one click away — not the default dump.
 */

type PhaseId = 'scaffold' | 'dependencies' | 'backend' | 'verify' | 'run';
type PhaseStatus = 'pending' | 'running' | 'complete' | 'failed';

type Phase = {
  id: PhaseId;
  agent: string;
  label: string;
  icon: string;
  actions: ActionState[];
  status: PhaseStatus;
  summary: string;
};

const PHASE_ORDER: PhaseId[] = ['scaffold', 'dependencies', 'backend', 'verify', 'run'];

const PHASE_META: Record<PhaseId, { agent: string; label: string; icon: string }> = {
  scaffold: { agent: 'Design', label: 'Delegated to Design Agent', icon: 'i-ph:paint-brush' },
  dependencies: { agent: 'Builder', label: 'Delegated to Builder', icon: 'i-ph:package' },
  backend: { agent: 'Backend', label: 'Delegated to Backend Agent', icon: 'i-ph:database' },
  verify: { agent: 'Quality', label: 'Delegated to Quality Agent', icon: 'i-ph:check-circle' },
  run: { agent: 'Preview', label: 'Starting preview', icon: 'i-ph:play-circle' },
};

/** Avoid `}` inside JSX attribute expressions (TSX parses it as end of expression). */
const RUNNING_ROW_BG = 'bg-[#EAF2FF]';

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

function summarize(id: PhaseId, actions: ActionState[], status: PhaseStatus): string {
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
      return `${actions.length} step${actions.length === 1 ? '' : 's'}`;
  }
}

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

function StatusIcon({ status }: { status: PhaseStatus }) {
  if (status === 'running') {
    return <div className="i-svg-spinners:90-ring-with-bg text-base text-[#2F6FED]" />;
  }

  if (status === 'complete') {
    return <div className="i-ph:check-circle-fill text-base text-emerald-500" />;
  }

  if (status === 'failed') {
    return <div className="i-ph:x-circle-fill text-base text-rose-500" />;
  }

  return <div className="i-ph:circle text-base text-gray-300" />;
}

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

  if (phase.status === 'pending') {
    return null;
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={classNames(
          'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
          phase.status === 'running' ? RUNNING_ROW_BG : 'hover:bg-gray-50',
        )}
      >
        <StatusIcon status={phase.status} />
        <span
          className={classNames('min-w-0 flex-1 truncate text-sm font-medium', {
            'text-gray-900': phase.status !== 'pending',
            'text-gray-400': phase.status === 'pending',
          })}
        >
          {phase.label}
        </span>
        <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">{phase.summary}</span>
        <span
          className={classNames(
            'shrink-0 text-gray-400 transition-transform',
            open ? 'i-ph:caret-up-bold' : 'i-ph:caret-down-bold',
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: cubicEasingFn }}
            className="overflow-hidden pl-8"
          >
            {phase.actions.map((action, i) => (
              <li key={i} className="flex items-center gap-2 py-1 font-mono text-xs text-gray-500">
                <StatusIcon status={action.status as PhaseStatus} />
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

  const visible = phases.filter((p) => p.status !== 'pending');
  const done = phases.filter((p) => p.status === 'complete').length;
  const failed = phases.some((p) => p.status === 'failed');
  const allDone = done === phases.length && !failed;
  const running = phases.find((p) => p.status === 'running');

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-2 py-2 shadow-sm">
      <div className="mb-1 flex items-center gap-2 px-2.5 pt-1">
        <span className="text-xs font-semibold text-gray-500">
          {failed ? 'Build stopped' : allDone ? 'Ready' : running ? running.label : 'Working'}
        </span>
        <span className="ml-auto text-xs tabular-nums text-gray-400">
          {done}/{phases.length}
        </span>
      </div>

      <ul className="flex flex-col">
        {visible.map((phase) => (
          <PhaseRow key={phase.id} phase={phase} />
        ))}
      </ul>
    </div>
  );
});
