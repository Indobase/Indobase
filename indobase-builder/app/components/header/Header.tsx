import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import { toggleSidebar } from '~/lib/stores/sidebar';
import { profileStore } from '~/lib/stores/profile';
import { resolveDefaultStudioUrl } from '~/lib/indobase/studio-origin';
import { classNames } from '~/utils/classNames';

export function Header() {
  const chat = useStore(chatStore);
  const backend = useStore(indobaseConnection);
  const profile = useStore(profileStore);
  const initial = (profile?.username || backend?.user?.email || 'U').charAt(0).toUpperCase();
  const studioUrl = (backend?.indobase?.studioUrl || resolveDefaultStudioUrl()).replace(/\/+$/, '');
  const upgradeHref = `${studioUrl}/`;

  return (
    <header
      className={classNames(
        'relative z-20 h-[var(--header-height)] px-3 md:px-4',
        chat.started ? 'border-b border-black/5 bg-white' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-full w-full items-center gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <a
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-gray-700 shadow-sm ring-1 ring-black/5 transition hover:bg-gray-50"
            title="Home"
            aria-label="Home"
          >
            <span className="i-ph:house text-lg" />
          </a>

          {chat.started ? (
            <span className="flex max-w-[16rem] items-center gap-2 truncate rounded-full bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-black/5 sm:max-w-xs">
              <img src="/icons/indobase-logo-mark.svg" alt="" className="h-4 w-4 shrink-0" />
              <span className="truncate">
                <ClientOnly>{() => <ChatDescription />}</ClientOnly>
              </span>
            </span>
          ) : (
            <a href="/" className="flex items-center gap-2 rounded-xl px-1.5 py-1" title="Indobase Builder">
              <img src="/icons/indobase-logo-mark.svg" alt="Indobase" className="h-7 w-7" />
              <span className="hidden text-sm font-semibold text-gray-800 sm:inline">Indobase</span>
            </a>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-2">
          <a
            href={upgradeHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center rounded-full bg-[#2F6FED] px-3.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
          >
            Upgrade
          </a>
          <button
            type="button"
            data-sidebar-toggle
            onClick={toggleSidebar}
            title="Menu & settings"
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/5 transition hover:bg-gray-50"
          >
            {profile?.avatar ? (
              <img src={profile.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              initial
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
