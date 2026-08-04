import { memo, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { initialBuildLifecycle } from '~/lib/stores/build-lifecycle';

const DISMISS_KEY = 'indobase.builder.agentWorkingBannerDismissed';

/**
 * Emergent-style wait cue while the first preview is being produced.
 */
export const AgentWorkingBanner = memo(function AgentWorkingBanner() {
  const lifecycle = useStore(initialBuildLifecycle);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const visible = (lifecycle === 'generating' || lifecycle === 'finalizing') && !dismissed;

  if (!visible) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);

    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#BFD9FF] bg-[#EAF2FF] px-3 py-2.5 text-sm text-gray-800 shadow-sm">
      <span className="i-svg-spinners:90-ring-with-bg shrink-0 text-base text-[#2F6FED]" />
      <p className="min-w-0 flex-1 leading-snug">
        Agent is working — first preview usually takes a few minutes.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-lg border border-white/80 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        Got it
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="i-ph:x shrink-0 text-sm text-gray-500 hover:text-gray-800"
      />
    </div>
  );
});
