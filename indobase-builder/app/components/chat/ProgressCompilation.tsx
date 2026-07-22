import { AnimatePresence, motion } from 'framer-motion';
import React, { useMemo, useState } from 'react';
import type { ProgressAnnotation } from '~/types/context';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

// User-facing phase names — plain language, not the internal agent identifiers.
const AGENT_PROGRESS_LABELS: Record<string, string> = {
  scoping: 'Understanding',
  planner: 'Planning',
  summary: 'Reviewing',
  context: 'Reading files',
  coder: 'Building',
  response: 'Building',
};

function labelFor(label: string) {
  return AGENT_PROGRESS_LABELS[label] ?? label.charAt(0).toUpperCase() + label.slice(1);
}

export default function ProgressCompilation({ data }: { data?: ProgressAnnotation[] }) {
  const [expanded, setExpanded] = useState(false);

  const progressList = useMemo<ProgressAnnotation[]>(() => {
    if (!data || data.length === 0) {
      return [];
    }

    // Keep the latest annotation per label; once a step is complete it stays complete.
    const map = new Map<string, ProgressAnnotation>();

    for (const item of data) {
      const existing = map.get(item.label);

      if (existing && existing.status === 'complete') {
        continue;
      }

      map.set(item.label, item);
    }

    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [data]);

  if (progressList.length === 0) {
    return null;
  }

  const doneCount = progressList.filter((p) => p.status === 'complete').length;
  const active = progressList.filter((p) => p.status === 'in-progress');
  const isWorking = active.length > 0;
  const current = active[active.length - 1] ?? progressList[progressList.length - 1];
  const allDone = doneCount === progressList.length;

  return (
    <div className="w-full max-w-chat mx-auto z-prompt">
      <div className="overflow-hidden rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        {/* Summary row — always visible, click to expand the full step list */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-theme hover:bg-bolt-elements-background-depth-3"
        >
          <StatusIcon status={allDone ? 'complete' : 'in-progress'} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 text-sm font-medium text-bolt-elements-textPrimary">
                {allDone ? 'Build steps complete' : labelFor(current.label)}
              </span>
              <span className="truncate text-sm text-bolt-elements-textSecondary">
                {allDone ? `${progressList.length} steps` : current.message}
              </span>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-bolt-elements-background-depth-1 px-2 py-0.5 text-xs font-medium tabular-nums text-bolt-elements-textSecondary">
            {doneCount}/{progressList.length}
          </span>
          <div
            className={classNames(
              'shrink-0 text-lg text-bolt-elements-textSecondary transition-transform',
              expanded ? 'i-ph:caret-up' : 'i-ph:caret-down',
            )}
          />
        </button>

        {/* Expanded step list */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: cubicEasingFn }}
              className="overflow-hidden border-t border-bolt-elements-borderColor"
            >
              <div className="flex flex-col gap-0.5 p-2">
                {progressList.map((item, index) => (
                  <ProgressItem key={`${item.label}-${index}`} progress={item} isLast={!isWorking && index === progressList.length - 1} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ProgressAnnotation['status'] }) {
  if (status === 'in-progress') {
    return <div className="i-svg-spinners:90-ring-with-bg shrink-0 text-lg text-bolt-elements-item-contentAccent" />;
  }

  if (status === 'complete') {
    return <div className="i-ph:check-circle-fill shrink-0 text-lg text-green-500" />;
  }

  return <div className="i-ph:circle-dashed shrink-0 text-lg text-bolt-elements-textTertiary" />;
}

const ProgressItem = ({ progress }: { progress: ProgressAnnotation; isLast?: boolean }) => {
  return (
    <motion.div
      className="flex items-start gap-2.5 rounded-lg px-2 py-1.5"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, ease: cubicEasingFn }}
    >
      <div className="mt-0.5">
        <StatusIcon status={progress.status} />
      </div>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        <span className="font-medium text-bolt-elements-textPrimary">{labelFor(progress.label)}</span>
        <span className="ml-1.5 break-words text-bolt-elements-textSecondary">{progress.message}</span>
      </div>
    </motion.div>
  );
};
