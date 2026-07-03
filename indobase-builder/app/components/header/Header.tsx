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

  return (
    <header
      className={classNames('h-[var(--header-height)] px-4 md:px-6', {
        'border-transparent': !chat.started,
        'border-b border-bolt-elements-borderColor': chat.started,
      })}
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-3">
        <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary">
          <button
            type="button"
            onClick={toggleSidebar}
            title="Previous chats"
            aria-label="Open previous chats"
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-item-backgroundActive"
          >
            <div className="i-ph:sidebar-simple-duotone text-xl" />
            <span className="i-ph:clock-counter-clockwise text-base opacity-70" />
          </button>
          <a href="/" className="flex items-center gap-2 text-accent">
            <img src="/logo.svg" alt="Indobase" className="h-8 w-8 inline-block" />
            <span className="text-lg font-semibold text-bolt-elements-textPrimary">Indobase Builder</span>
          </a>
        </div>
        {!chat.started && isStudioManagedConnection && (
          <span className="hidden rounded-full border border-[#FFC107]/30 bg-[#FFF7D6] px-3 py-1 text-xs font-medium text-[#8A6500] md:inline-flex dark:bg-[#3A2600]/60 dark:text-[#FFD54F]">
            Backend linked
          </span>
        )}
        {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
          <>
            <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
              <ClientOnly>{() => <ChatDescription />}</ClientOnly>
            </span>
            <ClientOnly>
              {() => (
                <div className="">
                  <HeaderActionButtons chatStarted={chat.started} />
                </div>
              )}
            </ClientOnly>
          </>
        )}
      </div>
    </header>
  );
}
