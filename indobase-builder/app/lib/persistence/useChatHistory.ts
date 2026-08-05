import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useState, useEffect, useCallback } from 'react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { logStore } from '~/lib/stores/logs'; // Import logStore
import {
  getMessages,
  getNextId,
  getUrlId,
  openDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
  getSnapshot,
  setSnapshot,
  type IChatMetadata,
} from './db';
import type { FileMap } from '~/lib/stores/files';
import type { Snapshot } from './types';
import { webcontainer } from '~/lib/webcontainer';
import { detectProjectCommands, createCommandActionsString } from '~/utils/projectCommands';
import type { ContextAnnotation } from '~/types/context';
import { shouldRejectGeneratedPath, normalizeGeneratedFilePath } from '~/lib/indobase/sanitizeGeneratedArtifact';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

/*
 * Tool calls that never got a result (the stream died or the page was closed mid-approval) would
 * otherwise reload as permanent "Run tool" approval cards. addToolResult() only updates the LAST
 * message, so auto-approve can never clear them — close them out at load time instead.
 */
function closeDanglingToolInvocations(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (message.role !== 'assistant' || !Array.isArray(message.parts)) {
      return message;
    }

    const hasDangling = message.parts.some(
      (part) => part.type === 'tool-invocation' && part.toolInvocation?.state !== 'result',
    );

    if (!hasDangling) {
      return message;
    }

    return {
      ...message,
      parts: message.parts.map((part) =>
        part.type === 'tool-invocation' && part.toolInvocation?.state !== 'result'
          ? {
              ...part,
              toolInvocation: {
                ...part.toolInvocation,
                state: 'result' as const,
                result: 'Error: Tool call was interrupted before it ran (chat was reloaded).',
              },
            }
          : part,
      ),
    };
  });
}

/*
 * Do NOT top-level-await openDatabase(): it blocks the Chat route module graph during hydrate.
 * A hung/blocked IndexedDB open left production ClientOnly stuck on "Loading Indobase Builder…".
 */
let dbInstance: IDBDatabase | undefined;
let dbOpenPromise: Promise<IDBDatabase | undefined> | undefined;
let dbOpenSettled = !persistenceEnabled;

function ensureDbOpen(): Promise<IDBDatabase | undefined> {
  if (!persistenceEnabled) {
    dbOpenSettled = true;
    return Promise.resolve(undefined);
  }

  if (!dbOpenPromise) {
    dbOpenPromise = openDatabase()
      .then((database) => {
        dbInstance = database;
        db = database;
        return database;
      })
      .finally(() => {
        dbOpenSettled = true;
      });
  }

  return dbOpenPromise;
}

/** Assigned once IndexedDB finishes opening; undefined while opening or if unavailable. */
export let db: IDBDatabase | undefined = undefined;

// Start opening immediately on the client without blocking module evaluation.
if (typeof window !== 'undefined' && persistenceEnabled) {
  void ensureDbOpen();
}

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);
export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();
  const [searchParams] = useSearchParams();

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const [dbState, setDbState] = useState<IDBDatabase | undefined>(dbInstance);
  const [dbReady, setDbReady] = useState(dbOpenSettled);

  useEffect(() => {
    let cancelled = false;

    void ensureDbOpen().then((database) => {
      if (!cancelled) {
        setDbState(database);
        setDbReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const activeDb = dbState;

    if (!activeDb) {
      // Still opening — wait unless persistence is disabled or open finished without a DB.
      if (persistenceEnabled && !dbReady) {
        return;
      }

      setReady(true);

      if (persistenceEnabled) {
        const error = new Error('Chat persistence is unavailable');
        logStore.logError('Chat persistence initialization failed', error);
        toast.error('Chat persistence is unavailable');
      }

      return;
    }

    if (mixedId) {
      Promise.all([
        getMessages(activeDb, mixedId),
        getSnapshot(activeDb, mixedId), // Fetch snapshot from DB
      ])
        .then(async ([storedMessages, snapshot]) => {
          if (storedMessages && storedMessages.messages.length > 0) {
            /*
             * const snapshotStr = localStorage.getItem(`snapshot:${mixedId}`); // Remove localStorage usage
             * const snapshot: Snapshot = snapshotStr ? JSON.parse(snapshotStr) : { chatIndex: 0, files: {} }; // Use snapshot from DB
             */
            const validSnapshot = snapshot || { chatIndex: '', files: {} }; // Ensure snapshot is not undefined
            const summary = validSnapshot.summary;

            const rewindId = searchParams.get('rewindTo');
            let startingIdx = -1;
            const endingIdx = rewindId
              ? storedMessages.messages.findIndex((m) => m.id === rewindId) + 1
              : storedMessages.messages.length;
            const snapshotIndex = storedMessages.messages.findIndex((m) => m.id === validSnapshot.chatIndex);

            if (snapshotIndex >= 0 && snapshotIndex < endingIdx) {
              startingIdx = snapshotIndex;
            }

            if (snapshotIndex > 0 && storedMessages.messages[snapshotIndex].id == rewindId) {
              startingIdx = -1;
            }

            let filteredMessages = storedMessages.messages.slice(startingIdx + 1, endingIdx);
            let archivedMessages: Message[] = [];

            if (startingIdx >= 0) {
              archivedMessages = storedMessages.messages.slice(0, startingIdx + 1);
            }

            setArchivedMessages(archivedMessages);

            if (startingIdx > 0) {
              const files = Object.entries(validSnapshot?.files || {})
                .map(([key, value]) => {
                  if (value?.type !== 'file') {
                    return null;
                  }

                  const relativePath = normalizeGeneratedFilePath(key);

                  if (shouldRejectGeneratedPath(relativePath)) {
                    return null;
                  }

                  return {
                    content: value.content,
                    path: relativePath || key,
                  };
                })
                .filter((x): x is { content: string; path: string } => !!x); // Type assertion
              const projectCommands = await detectProjectCommands(files);

              // Call the modified function to get only the command actions string
              const commandActionsString = createCommandActionsString(projectCommands);

              filteredMessages = [
                {
                  id: generateId(),
                  role: 'user',
                  content: `Restore project from snapshot`, // Removed newline
                  annotations: ['no-store', 'hidden'],
                },
                {
                  id: storedMessages.messages[snapshotIndex].id,
                  role: 'assistant',

                  // Combine followup message and the artifact with files and command actions
                  content: `Indobase Builder restored your chat from a snapshot. You can revert this message to load the full chat history.
                  <boltArtifact id="restored-project-setup" title="Restored Project & Setup" type="bundled">
                  ${Object.entries(snapshot?.files || {})
                    .map(([key, value]) => {
                      if (value?.type !== 'file') {
                        return ``;
                      }

                      const relativePath = normalizeGeneratedFilePath(key);

                      if (shouldRejectGeneratedPath(relativePath)) {
                        return ``;
                      }

                      return `
                      <boltAction type="file" filePath="${relativePath}">
${value.content}
                      </boltAction>
                      `;
                    })
                    .join('\n')}
                  ${commandActionsString} 
                  </boltArtifact>
                  `, // Added commandActionsString, followupMessage, updated id and title
                  annotations: [
                    'no-store',
                    ...(summary
                      ? [
                          {
                            chatId: storedMessages.messages[snapshotIndex].id,
                            type: 'chatSummary',
                            summary,
                          } satisfies ContextAnnotation,
                        ]
                      : []),
                  ],
                },

                // Remove the separate user and assistant messages for commands
                /*
                 *...(commands !== null // This block is no longer needed
                 *  ? [ ... ]
                 *  : []),
                 */
                ...filteredMessages,
              ];
              await restoreSnapshot(mixedId, validSnapshot);
            }

            setInitialMessages(closeDanglingToolInvocations(filteredMessages));

            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
            chatMetadata.set(storedMessages.metadata);
          } else {
            navigate('/', { replace: true });
          }

          setReady(true);
        })
        .catch((error) => {
          console.error(error);

          logStore.logError('Failed to load chat messages or snapshot', error); // Updated error message
          toast.error('Failed to load chat: ' + error.message); // More specific error
        });
    } else {
      // Handle case where there is no mixedId (e.g., new chat)
      setReady(true);
    }
  }, [mixedId, dbState, dbReady, navigate, searchParams]);

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, _chatId?: string | undefined, chatSummary?: string) => {
      const id = chatId.get();
      const activeDb = dbState ?? (await ensureDbOpen());

      if (!id || !activeDb) {
        return;
      }

      const snapshot: Snapshot = {
        chatIndex: chatIdx,
        files: Object.fromEntries(
          Object.entries(files).filter(([path, dirent]) => {
            if (!dirent) {
              return false;
            }

            return !shouldRejectGeneratedPath(path);
          }),
        ),
        summary: chatSummary,
      };

      // localStorage.setItem(`snapshot:${id}`, JSON.stringify(snapshot)); // Remove localStorage usage
      try {
        await setSnapshot(activeDb, id, snapshot);
      } catch (error) {
        console.error('Failed to save snapshot:', error);
        toast.error('Failed to save chat snapshot.');
      }
    },
    [dbState],
  );

  const restoreSnapshot = useCallback(async (id: string, snapshot?: Snapshot) => {
    // Snapshot restore needs WebContainer — never throw into chat load if WC is unavailable.
    try {
      const container = await webcontainer;
      const validSnapshot = snapshot || { chatIndex: '', files: {} };
      const files = validSnapshot.files ?? {};

      if (Object.keys(files).length === 0) {
        return;
      }

      const normalizePath = (filePath: string) => {
        const stripped = filePath.startsWith(container.workdir)
          ? filePath.slice(container.workdir.length)
          : filePath;
        return normalizeGeneratedFilePath(stripped);
      };

      for (const [key, value] of Object.entries(files)) {
        if (value?.type !== 'folder') {
          continue;
        }

        const relativePath = normalizePath(key);

        if (relativePath && !shouldRejectGeneratedPath(relativePath)) {
          await container.fs.mkdir(relativePath, { recursive: true });
        }
      }

      for (const [key, value] of Object.entries(files)) {
        if (value?.type !== 'file') {
          continue;
        }

        const relativePath = normalizePath(key);

        if (!relativePath || shouldRejectGeneratedPath(relativePath)) {
          continue;
        }

        await container.fs.writeFile(relativePath, value.content, {
          encoding: value.isBinary ? undefined : 'utf8',
        });
      }
    } catch (error) {
      console.warn('Snapshot restore skipped (workspace not ready):', error);
    }
  }, []);

  return {
    ready: !mixedId || ready,
    initialMessages,
    updateChatMestaData: async (metadata: IChatMetadata) => {
      const id = chatId.get();
      const activeDb = dbState ?? (await ensureDbOpen());

      if (!activeDb || !id) {
        return;
      }

      try {
        await setMessages(activeDb, id, initialMessages, urlId, description.get(), undefined, metadata);
        chatMetadata.set(metadata);
      } catch (error) {
        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory: async (messages: Message[]) => {
      const activeDb = dbState ?? (await ensureDbOpen());

      if (!activeDb || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;
      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      let _urlId = urlId;

      if (!urlId && firstArtifact?.id) {
        const urlId = await getUrlId(activeDb, firstArtifact.id);
        _urlId = urlId;
        navigateChat(urlId);
        setUrlId(urlId);
      }

      let chatSummary: string | undefined = undefined;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === 'assistant') {
        const annotations = lastMessage.annotations as JSONValue[];
        const filteredAnnotations = (annotations?.filter(
          (annotation: JSONValue) =>
            annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
        ) || []) as { type: string; value: any } & { [key: string]: any }[];

        if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
          chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
        }
      }

      takeSnapshot(messages[messages.length - 1].id, workbenchStore.files.get(), _urlId, chatSummary);

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      // Ensure chatId.get() is used here as well
      if (initialMessages.length === 0 && !chatId.get()) {
        const nextId = await getNextId(activeDb);

        chatId.set(nextId);

        if (!urlId) {
          navigateChat(nextId);
        }
      }

      // Ensure chatId.get() is used for the final setMessages call
      const finalChatId = chatId.get();

      if (!finalChatId) {
        console.error('Cannot save messages, chat ID is not set.');
        toast.error('Failed to save chat messages: Chat ID missing.');

        return;
      }

      // Persist the resolved urlId (_urlId), not the stale closure — otherwise the URL
      // updates but IndexedDB never gets urlId, so /chat/:id restore fails.
      await setMessages(
        activeDb,
        finalChatId, // Use the potentially updated chatId
        [...archivedMessages, ...messages],
        _urlId,
        description.get(),
        undefined,
        chatMetadata.get(),
      );
    },
    duplicateCurrentChat: async (listItemId: string) => {
      const activeDb = dbState ?? (await ensureDbOpen());

      if (!activeDb || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateChat(activeDb, mixedId || listItemId);
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: Message[], metadata?: IChatMetadata) => {
      const activeDb = dbState ?? (await ensureDbOpen());

      if (!activeDb) {
        return;
      }

      try {
        const newId = await createChatFromMessages(activeDb, description, messages, metadata);
        window.location.href = `/chat/${newId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId) => {
      const activeDb = dbState ?? (await ensureDbOpen());

      if (!activeDb || !id) {
        return;
      }

      const chat = await getMessages(activeDb, id);
      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
