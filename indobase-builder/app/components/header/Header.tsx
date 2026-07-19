import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import { isIndobaseStudioManagedConnection } from '~/lib/indobase/connection';
import { toggleSidebar } from '~/lib/stores/sidebar';
import { profileStore } from '~/lib/stores/profile';

export function Header() {
  const chat = useStore(chatStore);
  const backend = useStore(indobaseConnection);
  const profile = useStore(profileStore);
  const isStudioManagedConnection = isIndobaseStudioManagedConnection(backend);
  const isBackendConnected = isStudioManagedConnection || Boolean(backend?.isConnected);
  const initial = (profile?.username || backend?.user?.email || 'U').charAt(0).toUpperCase();

  // Quiet chrome: the header floats on the canvas in both states — no bar, no divider.
  return (
    <header className="relative z-20 h-[var(--header-height)] px-3 md:px-5">
      <div className="mx-auto flex h-full w-full items-center gap-3">
        <div className="flex items-center gap-2 text-bolt-elements-textPrimary">
          <a
            href="/"
            className="flex items-center gap-2 rounded-xl bg-white/70 px-2.5 py-1.5 shadow-sm ring-1 ring-black/5 backdrop-blur-md transition hover:bg-white"
            title="Home"
            aria-label="Home"
          >
            <img src="/logo.svg" alt="Indobase" className="h-6 w-6" />
          </a>

          {chat.started ? (
            <span className="max-w-[14rem] truncate rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-black/5 sm:max-w-xs">
              <ClientOnly>{() => <ChatDescription />}</ClientOnly>
            </span>
          ) : null}

          {/* Only in the workspace — on the home the prompt card's footer already states this. */}
          {chat.started && isBackendConnected && (
            <span
              title="Connected to your Indobase backend"
              className="hidden shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 md:inline-flex"
            >
              <span className="i-ph:check-circle-fill text-sm text-emerald-500" />
              Backend linked
            </span>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-2">
          {chat.started && (
            <ClientOnly>{() => <HeaderActionButtons chatStarted={chat.started} />}</ClientOnly>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            title="Menu & settings"
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/5 transition hover:bg-white"
          >
            {initial}
          </button>
        </div>
      </div>
    </header>
  );
}
