import { AnimatePresence, motion } from 'framer-motion';
import React, { useMemo, useState } from 'react';
import type { ProgressAnnotation } from '~/types/context';
import { cubicEasingFn } from '~/utils/easings';

const AGENT_PROGRESS_LABELS: Record<string, string> = {
  scoping: 'Understanding your request',
  planner: 'Delegated to Planning Agent',
  summary: 'Reviewing progress',
  context: 'Reading project files',
  coder: 'Delegated to Builder',
  response: 'Delegated to Design Agent',
};

function labelFor(label: unknown) {
  if (typeof label !== 'string' || !label.trim()) {
    return 'Agent is working';
  }

  return AGENT_PROGRESS_LABELS[label] ?? label.charAt(0).toUpperCase() + label.slice(1);
}

function normalizeProgressItem(item: ProgressAnnotation | null | undefined, index: number): ProgressAnnotation | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const label = typeof item.label === 'string' && item.label.trim() ? item.label : `step-${index + 1}`;
  const status: ProgressAnnotation['status'] =
    item.status === 'complete' || item.status === 'in-progress' ? item.status : 'in-progress';
  const order = typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index;
  const message = typeof item.message === 'string' ? item.message : '';

  return { ...item, type: 'progress', label, status, order, message };
}

export default function ProgressCompilation({ data }: { data?: ProgressAnnotation[] }) {
  const [expanded, setExpanded] = useState(false);

  const progressList = useMemo<ProgressAnnotation[]>(() => {
    if (!data || data.length === 0) {
      return [];
    }

    const map = new Map<string, ProgressAnnotation>();

    data.forEach((raw, index) => {
      const item = normalizeProgressItem(raw, index);

      if (!item) {
        return;
      }

      const existing = map.get(item.label);

      if (existing && existing.status === 'complete') {
        return;
      }

      map.set(item.label, item);
    });

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

  if (!current) {
    return null;
  }

  const completed = progressList.filter((p) => p.status === 'complete');

  return (
    <div className="z-prompt mx-auto w-full max-w-chat">
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-0.5 p-1.5">
          {completed.slice(-2).map((item, index) => (
            <div key={`done-${item.label}-${index}`} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
              <div className="i-ph:check-circle-fill shrink-0 text-base text-emerald-500" />
              <span className="truncate text-sm font-medium text-gray-800">{labelFor(item.label)}</span>
            </div>
          ))}

          {!allDone && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-xl bg-[#EAF2FF] px-2.5 py-2.5 text-left transition hover:brightness-[0.98]"
              aria-expanded={expanded}
            >
              <StatusIcon status="in-progress" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">{labelFor(current.label)}</span>
                {current.message ? (
                  <span className="block truncate text-xs text-gray-500">{current.message}</span>
                ) : null}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-gray-400">
                {doneCount}/{progressList.length}
              </span>
            </button>
          )}

          {allDone && (
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
              <div className="i-ph:check-circle-fill shrink-0 text-base text-emerald-500" />
              <span className="text-sm font-medium text-gray-800">All steps complete</span>
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: cubicEasingFn }}
              className="overflow-hidden border-t border-gray-100"
            >
              <div className="flex flex-col gap-0.5 p-2">
                {progressList.map((item, index) => (
                  <ProgressItem
                    key={`${item.label}-${index}`}
                    progress={item}
                    isLast={!isWorking && index === progressList.length - 1}
                  />
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
    return <div className="i-svg-spinners:90-ring-with-bg shrink-0 text-lg text-[#2F6FED]" />;
  }

  if (status === 'complete') {
    return <div className="i-ph:check-circle-fill shrink-0 text-lg text-emerald-500" />;
  }

  return <div className="i-ph:circle-dashed shrink-0 text-lg text-gray-300" />;
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
        <span className="font-medium text-gray-900">{labelFor(progress.label)}</span>
        {progress.message ? <span className="ml-1.5 break-words text-gray-500">{progress.message}</span> : null}
      </div>
    </motion.div>
  );
};
