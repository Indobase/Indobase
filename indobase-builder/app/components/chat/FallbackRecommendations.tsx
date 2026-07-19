import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { memo, useMemo } from 'react';
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
 * Shown after a successful one-shot preview when the model did not emit its own
 * <bolt-quick-actions> block. Kept outside the streaming message parser so chips
 * always appear once preview-ready is set.
 */
export const FallbackRecommendations = memo(
  ({ messages, append, model, provider }: FallbackRecommendationsProps) => {
    const lifecycle = useStore(initialBuildLifecycle);

    const shouldShow = useMemo(() => {
      if (lifecycle !== 'preview-ready' || !append) {
        return false;
      }

      const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
      return !/<bolt-quick-actions?\b/i.test(messageText(lastAssistant));
    }, [lifecycle, messages, append]);

    if (!shouldShow) {
      return null;
    }

    return (
      <div className="mx-auto flex w-full max-w-chat flex-wrap items-center gap-2 px-1 pb-2">
        {FALLBACK_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-md bg-bolt-elements-item-backgroundAccent px-3 py-1.5 text-xs text-bolt-elements-item-contentAccent opacity-90 hover:opacity-100"
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
            <span className="i-ph:chats text-sm" />
            {action.label}
          </button>
        ))}
      </div>
    );
  },
);
