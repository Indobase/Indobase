import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { toast } from 'react-toastify';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { db, deleteById, getAll, type ChatHistoryItem } from '~/lib/persistence';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';

type AppsTab = 'mine' | 'published';

function formatRelativeUpdated(timestamp: string): string {
  const then = new Date(timestamp).getTime();

  if (Number.isNaN(then)) {
    return 'Updated recently';
  }

  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) {
    return 'Updated just now';
  }

  if (mins < 60) {
    return `Updated ${mins} min${mins === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(mins / 60);

  if (hours < 24) {
    return `Updated ${hours} hr${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);

  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
}

/** Prefer urlId (pretty) then internal id — matches sidebar HistoryItem + getMessages lookup. */
export function appHref(item: Pick<ChatHistoryItem, 'id' | 'urlId'>): string {
  return `/chat/${item.urlId || item.id}`;
}

/**
 * Hard navigation — Remix <Link> soft-nav leaves ChatImpl mounted with stale chatStarted /
 * useChat state (see navigateChat FIXME). Plain anchors match sidebar history and remount cleanly.
 */
function openApp(href: string, event?: MouseEvent) {
  if (event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey || event?.button === 1) {
    return;
  }

  event?.preventDefault();
  window.location.assign(href);
}

export function MyAppsList() {
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [tab, setTab] = useState<AppsTab>('mine');
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ChatHistoryItem | null>(null);

  const loadEntries = useCallback(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    getAll(db)
      .then((items) =>
        items.filter((item) => (item.urlId || item.id) && (item.description || item.messages?.length)),
      )
      .then((items) => {
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setList(items);
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const deleteApp = useCallback(
    async (item: ChatHistoryItem) => {
      if (!db) {
        return;
      }

      try {
        localStorage.removeItem(`snapshot:${item.id}`);
        await deleteById(db, item.id);
        toast.success('App deleted');
        loadEntries();
      } catch {
        toast.error('Failed to delete app');
      }
    },
    [loadEntries],
  );

  const visible = useMemo(() => {
    if (tab === 'published') {
      return [] as ChatHistoryItem[];
    }

    return list;
  }, [list, tab]);

  return (
    <div className="mx-auto w-full max-w-[42rem]">
      <div className="mb-4 flex justify-center">
        <div className="inline-flex rounded-full bg-white/55 p-1 shadow-sm ring-1 ring-black/5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setTab('mine')}
            className={classNames(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              tab === 'mine'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            My Apps ({list.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('published')}
            className={classNames(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              tab === 'published'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            Published apps
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white/70 px-4 py-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/5 backdrop-blur-md">
          Loading apps…
        </div>
      ) : tab === 'published' ? (
        <div className="rounded-2xl bg-white/70 px-4 py-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/5 backdrop-blur-md">
          Published apps will appear here after you publish to Indobase.
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-white/70 px-4 py-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/5 backdrop-blur-md">
          No apps yet — describe an idea above to start building.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => {
            const href = appHref(item);

            return (
              <li key={item.id}>
                <div className="group flex items-center gap-3 rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur-md transition hover:bg-white hover:shadow-md">
                  <a
                    href={href}
                    onClick={(event) => openApp(href, event)}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-sky-50 to-slate-100 ring-1 ring-black/5">
                      <span className="i-ph:app-window text-base text-slate-400" />
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {item.description || 'Untitled app'}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {formatRelativeUpdated(item.timestamp)}
                      </div>
                    </div>
                  </a>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        aria-label="App options"
                        className="rounded-lg p-2 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <span className="i-ph:dots-three-bold text-lg" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content
                      className="z-[200] min-w-[160px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                      sideOffset={4}
                      align="end"
                    >
                      <DropdownMenu.Item asChild>
                        <a
                          href={href}
                          onClick={(event) => openApp(href, event)}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50"
                        >
                          Open
                        </a>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50"
                        onSelect={() => setPendingDelete(item)}
                      >
                        Delete
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Deleting an app drops its chat history and snapshot — always confirm first. */}
      <DialogRoot open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <Dialog onBackdrop={() => setPendingDelete(null)} onClose={() => setPendingDelete(null)}>
          <div className="bg-white p-6">
            <DialogTitle className="text-gray-900">Delete app?</DialogTitle>
            <DialogDescription className="mt-2 text-gray-600">
              <p>
                You are about to delete{' '}
                <span className="font-medium text-gray-900">
                  {pendingDelete?.description || 'Untitled app'}
                </span>
                .
              </p>
              <p className="mt-2">This removes its chat history and snapshot. This cannot be undone.</p>
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
            <DialogButton type="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </DialogButton>
            <DialogButton
              type="danger"
              onClick={() => {
                if (pendingDelete) {
                  void deleteApp(pendingDelete);
                }

                setPendingDelete(null);
              }}
            >
              Delete
            </DialogButton>
          </div>
        </Dialog>
      </DialogRoot>
    </div>
  );
}
