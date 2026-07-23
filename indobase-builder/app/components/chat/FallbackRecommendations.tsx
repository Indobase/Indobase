import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { memo, useMemo } from 'react';
import { hasRenderableQuickActions } from '~/lib/runtime/quick-actions';
import { initialBuildLifecycle } from '~/lib/stores/build-lifecycle';
import type { ProviderInfo } from '~/types/model';

const FALLBACK_ACTIONS = [
  {
    label: 'Polish the design',
    message: 'Polish the visual design with better spacing, typography, and color contrast',
  },
  {
    label: 'Improve mobile layout',
    message: 'Make the layout fully responsive for mobile and tablet',
  },
  {
    label: 'Add animations',
    message: 'Add smooth scroll and subtle entrance animations',
  },
  {
    label: 'Improve SEO',
    message: 'Improve SEO with better meta tags, page titles, and descriptions',
  },
] as const;

function messageText(message: Message | undefined): string {
  if (!message) {
    return '';
  }

  if (Array.isArray(message.content)) {
    return ((message.content as any[]).find((item) => item.type === 'text')?.text as string) || '';
  }

  return message.content;
}

interface FallbackRecommendationsProps {
  messages: Message[];
  append?: (message: Message) => void;
  model?: string;
  provider?: ProviderInfo;
}

/**
 * Shown after the initial build settles (preview-ready or failed) when the model
 * did not emit any renderable quick-action chips. Kept outside the streaming
 * message parser so chips always appear once the build is no longer in flight.
 */
export const FallbackRecommendations = memo(
  ({ messages, append, model, provider }: FallbackRecommendationsProps) => {
    const lifecycle = useStore(initialBuildLifecycle);

    const shouldShow = useMemo(() => {
      if ((lifecycle !== 'preview-ready' && lifecycle !== 'failed') || !append) {
        return false;
      }

      /*
       * Only suppress when the model emitted chips the parser can actually render.
       * A bare <bolt-quick-actions> wrapper with no usable children (a common model
       * mistake) must not hide the fallback chips.
       */
      const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');

      if (!lastAssistant) {
        return false;
      }

      return !hasRenderableQuickActions(messageText(lastAssistant));
    }, [lifecycle, messages, append]);

    if (!shouldShow) {
      return null;
    }

    return (
      <div
        className="mx-auto w-full max-w-chat px-1 pb-3"
        role="region"
        aria-label="Suggested next steps"
      >
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
          Suggested next steps
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {FALLBACK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3.5 py-3 text-left transition-theme hover:border-bolt-elements-item-contentAccent hover:bg-bolt-elements-item-backgroundAccent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bolt-elements-item-contentAccent"
              onClick={() => {
                append({
                  id: `fallback-quick-action-${Date.now()}`,
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `[Model: ${model}]\n\n[Provider: ${provider?.name}]\n\n${action.message}`,
                    },
                  ] as any,
                });
              }}
            >
              <span className="i-ph:sparkle mt-0.5 shrink-0 text-base text-bolt-elements-item-contentAccent" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-bolt-elements-textPrimary">{action.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-bolt-elements-textSecondary">
                  {action.message}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  },
);
