import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import { isIndobaseStudioManagedConnection } from '~/lib/indobase/connection';
import { toggleSidebar } from '~/lib/stores/sidebar';

export function Header() {
  const chat = useStore(chatStore);
  const backend = useStore(indobaseConnection);
  const isStudioManagedConnection = isIndobaseStudioManagedConnection(backend);
  const isBackendConnected = isStudioManagedConnection || Boolean(backend?.isConnected);

  return (
    <header
      className={classNames('h-[var(--header-height)] px-4 md:px-6', {
        'border-transparent': !chat.started,
        'border-b border-bolt-elements-borderColor': chat.started,
      })}
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-3">
        {/* Left: logo + previous chats + backend status */}
        <div className="flex items-center gap-2.5 z-logo text-bolt-elements-textPrimary">
          <a href="/" className="flex items-center gap-2 text-accent">
            <img src="/logo.svg" alt="Indobase" className="h-8 w-8 inline-block" />
            <span className="text-lg font-semibold text-bolt-elements-textPrimary">Indobase Builder</span>
          </a>
          <button
            type="button"
            onClick={toggleSidebar}
            title="Previous chats"
            aria-label="Open previous chats"
            className="flex items-center gap-1.5 rounded-lg border border-bolt-elements-borderColor px-2.5 py-1.5 text-sm text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-textPrimary"
          >
            <span className="i-ph:clock-counter-clockwise text-base" />
            <span className="hidden sm:inline">Chats</span>
          </button>
          {isBackendConnected && (
            <span
              title="Connected to your Indobase backend"
              className="hidden shrink-0 items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 md:inline-flex dark:text-green-400"
            >
              <span className="i-ph:check-circle-fill text-sm text-green-500" />
              Backend linked
            </span>
          )}
        </div>

        {/* Center: chat title when in a chat, otherwise a spacer */}
        {chat.started ? (
          <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
        ) : (
          <div className="flex-1" />
        )}

        {/* Right: (in-chat) action buttons */}
        {chat.started && (
          <div className="flex shrink-0 items-center gap-2">
            <ClientOnly>{() => <HeaderActionButtons chatStarted={chat.started} />}</ClientOnly>
          </div>
        )}
      </div>
    </header>
  );
}
