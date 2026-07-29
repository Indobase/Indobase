import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import {
  ALLOWED_CHAT_PROVIDER_NAMES,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  FIXED_MODEL_PROVIDER_NAME,
  PROMPT_COOKIE_KEY,
  PROVIDER_LIST,
} from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { indobaseConnection, updateIndobaseConnection } from '~/lib/stores/indobase-connection';
import { useMCPStore } from '~/lib/stores/mcp';
import { defaultDesignScheme, type DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { ORCHESTRATOR_REPAIR_USER_PREFIX } from '~/lib/orchestration/prompts';
import { usePendingDeploy } from '~/lib/hooks/usePendingDeploy';
import { INDOBASE_MCP_SERVER_NAME } from '~/lib/indobase/mcp';
import {
  hasIndobaseStudioHandoff,
  hasSelectedIndobaseProject,
  isIndobaseStudioManagedConnection,
} from '~/lib/indobase/connection';
import { finalizeCodegen } from '~/lib/indobase/finalizeCodegen';
import { publishDraftPreview } from '~/lib/indobase/publishDraftPreview';
import { isServerPreviewMode } from '~/lib/webcontainer/preview-mode';
import { computeStreamProgressMarker } from '~/lib/indobase/stream-progress';
import { seedProjectEnvIfMissing } from '~/lib/indobase/seedProjectEnv';
import {
  consumePendingBuildPrompt,
  ensureBuilderSession,
  getBuilderRequestInit,
  getStoredBuilderMcpToken,
  prepareStudioLinkedChat,
  redirectToStudioBuilderConnect,
} from '~/lib/indobase/builder-auth.client';
import { getStudioBackendUserPreamble, wrapStudioContext } from '~/lib/indobase/studio-database-prompt';
import { getStudioSchemaPreamble } from '~/lib/indobase/studioSchema';
import { runStudioBackendPreflight } from '~/lib/indobase/studioPreflight';
import { TOOL_EXECUTION_APPROVAL } from '~/utils/constants';
import type { ToolCallAnnotation } from '~/types/context';
import type { TextUIPart, FileUIPart, Attachment } from '@ai-sdk/ui-utils';
import type { LlmErrorAlertType } from '~/types/actions';
import type { BuilderPromptQuotaState } from '~/types/builder-quota';
import { beginInitialBuild, failInitialBuild, initialBuildLifecycle } from '~/lib/stores/build-lifecycle';
import { decideAutomaticPreviewRepair, MAX_AUTOMATIC_PREVIEW_REPAIRS } from '~/lib/indobase/automatic-repair';
import { capturePostHogEvent, capturePostHogException } from '~/lib/analytics/posthog.client';
import { BUILDER_EVENTS } from '~/lib/analytics/events';

const logger = createScopedLogger('Chat');
const getAllowedChatProviders = () =>
  PROVIDER_LIST.filter((provider) =>
    ALLOWED_CHAT_PROVIDER_NAMES.includes(provider.name as (typeof ALLOWED_CHAT_PROVIDER_NAMES)[number]),
  ).sort(
    (left, right) =>
      ALLOWED_CHAT_PROVIDER_NAMES.indexOf(left.name as (typeof ALLOWED_CHAT_PROVIDER_NAMES)[number]) -
      ALLOWED_CHAT_PROVIDER_NAMES.indexOf(right.name as (typeof ALLOWED_CHAT_PROVIDER_NAMES)[number]),
  );

const ALLOWED_CHAT_PROVIDERS = getAllowedChatProviders();

// OpenRouter has the configured key and serves DEFAULT_MODEL; OpenAI does not.
const DEFAULT_CHAT_PROVIDER =
  ALLOWED_CHAT_PROVIDERS.find((provider) => provider.name === 'OpenRouter') ||
  ALLOWED_CHAT_PROVIDERS[0] ||
  DEFAULT_PROVIDER;
const HIDDEN_CHAT_PROVIDER =
  ALLOWED_CHAT_PROVIDERS.find((provider) => provider.name === FIXED_MODEL_PROVIDER_NAME) || DEFAULT_CHAT_PROVIDER;

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages((initialMessages ?? []).map((m) => m.id));
  }, [initialMessages]);

  if (!ready) {
    return (
      <div className="flex h-full min-h-[12rem] w-full items-center justify-center px-4">
        <div className="flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm text-gray-600 shadow-sm ring-1 ring-black/5">
          <span className="i-svg-spinners:90-ring-with-bg text-base text-gray-500" aria-hidden />
          Loading chat…
        </div>
      </div>
    );
  }

  return (
    <ChatImpl
      description={title}
      initialMessages={initialMessages}
      exportChat={exportChat}
      storeMessageHistory={storeMessageHistory}
      importChat={importChat}
    />
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      if (isLoading) {
        // IndexedDB + full file snapshots every 50ms freeze the tab during large streams.
        persistSampledHistory(messages, storeMessageHistory);
      } else {
        void persistSampledHistory.flush();
        storeMessageHistory(messages).catch((error) => toast.error(error.message));
      }
    }
  },
  50,
);

const persistSampledHistory = createSampler(
  (messages: Message[], storeMessageHistory: (messages: Message[]) => Promise<void>) => {
    storeMessageHistory(messages).catch((error) => toast.error(error.message));
  },
  2000,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();
    usePendingDeploy();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    useEffect(() => {
      if (!chatStarted) {
        return;
      }

      void import('~/lib/webcontainer').then(({ getWebcontainer }) => getWebcontainer());
    }, [chatStarted]);

    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const files = useStore(workbenchStore.files);
    const [designScheme, setDesignScheme] = useState<DesignScheme>(defaultDesignScheme);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const indobaseConn = useStore(indobaseConnection);
    const hasSelectedProject = hasSelectedIndobaseProject(indobaseConn);
    const indobaseBackendAlert = useStore(workbenchStore.indobaseBackendAlertAtom);
    const { promptId, contextOptimizationEnabled } = useSettings();
    const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);
    const [builderPromptQuota, setBuilderPromptQuota] = useState<
      (BuilderPromptQuotaState & { studioUrl?: string }) | null
    >(null);
    const [model] = useState(DEFAULT_MODEL);
    const [provider, setProvider] = useState(HIDDEN_CHAT_PROVIDER as ProviderInfo);
    const { showChat } = useStore(chatStore);
    const [animationScope, animate] = useAnimate();
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [chatMode, setChatMode] = useState<'discuss' | 'build'>('build');
    const orchestratorChatRetryRef = useRef(0);
    const MAX_ORCHESTRATOR_CHAT_RETRIES = 8;
    const automaticPreviewRepairAttemptRef = useRef(0);
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const refreshBuilderPromptQuota = useCallback(async () => {
      if (!isIndobaseStudioManagedConnection(indobaseConn)) {
        setBuilderPromptQuota(null);
        return;
      }

      try {
        const response = await fetch('/api/indobase/prompt-quota', getBuilderRequestInit());

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as BuilderPromptQuotaState & {
          studioUrl?: string;
        };
        setBuilderPromptQuota(payload);
      } catch (error) {
        logger.warn('Failed to load Builder prompt quota', error);
      }
    }, [indobaseConn]);

    useEffect(() => {
      void refreshBuilderPromptQuota();
    }, [refreshBuilderPromptQuota]);

    const resolveUpgradeUrl = useCallback(
      (upgradePath?: string) => {
        if (!upgradePath) {
          return undefined;
        }

        if (upgradePath.startsWith('http://') || upgradePath.startsWith('https://')) {
          return upgradePath;
        }

        const studioUrl = builderPromptQuota?.studioUrl || indobaseConn.indobase?.studioUrl;

        if (!studioUrl) {
          return upgradePath;
        }

        return new URL(upgradePath, `${studioUrl.replace(/\/+$/, '')}/`).toString();
      },
      [builderPromptQuota?.studioUrl, indobaseConn.indobase?.studioUrl],
    );

    const mcpSettings = useMCPStore((state) => state.settings);

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
      addToolResult,
    } = useChat({
      api: '/api/chat',
      fetch: (input, init) => fetch(input, getBuilderRequestInit(init)),
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
        chatMode,
        designScheme,
        indobase: {
          isConnected: indobaseConn.isConnected ?? false,
          hasSelectedProject,
          connectionSource: indobaseConn.connectionSource,
          credentials: {
            apiUrl: indobaseConn?.credentials?.apiUrl,
            anonKey: indobaseConn?.credentials?.anonKey,
          },
          indobase: indobaseConn.indobase
            ? {
                apiUrl: indobaseConn.indobase.apiUrl,
                authUrl: indobaseConn.indobase.authUrl,
                projectRef: indobaseConn.indobase.projectRef,
                restUrl: indobaseConn.indobase.restUrl,
                storageUrl: indobaseConn.indobase.storageUrl,
                studioUrl: indobaseConn.indobase.studioUrl,
              }
            : undefined,
        },
        maxLLMSteps: mcpSettings.maxLLMSteps,
        multiAgentMode: chatMode === 'build',
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        setFakeLoading(false);
        streamingState.set(false);
        failInitialBuild();

        capturePostHogEvent(BUILDER_EVENTS.generationFailed, {
          model,
          provider: provider.name,
          chat_mode: chatMode,
          duration_ms: generationStartedAtRef.current
            ? Date.now() - generationStartedAtRef.current
            : undefined,
          // Reason code only — never the raw message, which can echo user content.
          error_type: e instanceof Error ? e.name : 'unknown',
        });
        generationStartedAtRef.current = null;

        handleError(e, 'chat');
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        const isInitialBuild = ['generating', 'finalizing'].includes(initialBuildLifecycle.get());
        setData(undefined);

        if (isInitialBuild) {
          initialBuildLifecycle.set('finalizing');
          setFakeLoading(true);
          streamingState.set(true);
        } else if (chatMode !== 'build') {
          setFakeLoading(false);
          streamingState.set(false);
        }

        if (usage) {
          console.log('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');

        // Token counts + duration here are what make cost-per-user and model comparison possible.
        capturePostHogEvent(BUILDER_EVENTS.generationCompleted, {
          model,
          provider: provider.name,
          chat_mode: chatMode,
          tokens_in: usage?.promptTokens,
          tokens_out: usage?.completionTokens,
          duration_ms: generationStartedAtRef.current
            ? Date.now() - generationStartedAtRef.current
            : undefined,
          response_length: message.content.length,
        });
        generationStartedAtRef.current = null;

        void refreshBuilderPromptQuota();

        orchestratorChatRetryRef.current = 0;

        // Keep build mode active until all actions finish and the actual preview iframe loads.
        void finalizeBuildAndMaybeRepair(isInitialBuild);
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });

    useEffect(() => {
      if (provider.name !== HIDDEN_CHAT_PROVIDER.name) {
        setProvider(HIDDEN_CHAT_PROVIDER as ProviderInfo);
      }
    }, [provider.name]);

    const urlPromptHandledRef = useRef(false);

    // Raw user text of the in-flight submit, stashed so a mid-submit Studio redirect can replay it.
    const pendingBuildPromptRef = useRef<string>('');

    // Start time of the current generation, so completed/failed events can report duration.
    const generationStartedAtRef = useRef<number | null>(null);

    useEffect(() => {
      if (urlPromptHandledRef.current || chatStarted) {
        return;
      }

      const urlPrompt = searchParams.get('prompt');

      /*
       * A prompt stashed before the Studio auth round-trip (see redirectToStudioBuilderConnect).
       * Only replay it once the connection is actually linked — otherwise the autostart below would
       * fail prepareStudioLinkedChat and bounce back to Studio, re-persisting the prompt in a loop.
       * The effect re-runs when indobaseConn changes, so waiting here is safe.
       */
      let pendingPrompt: string | null = null;

      if (!urlPrompt) {
        if (!hasIndobaseStudioHandoff(indobaseConn) && !hasSelectedProject) {
          return;
        }

        pendingPrompt = consumePendingBuildPrompt();
      }

      const prompt = urlPrompt || pendingPrompt;

      if (!prompt) {
        return;
      }

      // A restored prompt was already a Build click, so run it rather than just filling the box.
      const shouldAutostart = searchParams.get('autostart') === '1' || Boolean(pendingPrompt);

      urlPromptHandledRef.current = true;
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('prompt');
          next.delete('autostart');

          return next;
        },
        { replace: true },
      );

      if (shouldAutostart) {
        void (async () => {
          const ready = await prepareStudioLinkedChat();

          if (!ready && hasIndobaseStudioHandoff(indobaseConn)) {
            toast.error('Builder session expired. Reconnecting through Studio…');
            redirectToStudioBuilderConnect();

            return;
          }

          runAnimation();

          const preamble = hasIndobaseStudioHandoff(indobaseConn)
            ? wrapStudioContext(`${getStudioBackendUserPreamble()}${await getStudioSchemaPreamble(indobaseConn)}`)
            : '';

          if (chatMode === 'build') {
            automaticPreviewRepairAttemptRef.current = 0;
            beginInitialBuild();
          }

          append({
            role: 'user',
            content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${preamble}${prompt}`,
          });
        })();
        return;
      }

      setInput(prompt);
      textareaRef.current?.focus();
    }, [append, chatMode, chatStarted, model, provider, searchParams, setInput, setSearchParams, indobaseConn]);

    /*
     * The connect-redirect loop guard (builder-auth.client) lands here with this flag when the
     * browser is blocking the session cookie. Explain it instead of leaving the user in a silent
     * loop / ERR_TOO_MANY_REDIRECTS.
     */
    useEffect(() => {
      if (searchParams.get('builder_session_error') !== 'cookies') {
        return;
      }

      setLlmErrorAlert({
        type: 'error',
        title: 'Sign-in was blocked by your browser',
        description:
          'Your browser blocked the cookie needed to keep you signed in, so connecting kept looping. ' +
          'Turn off private/incognito mode, allow cookies for indobase.in, or try a different browser, then reconnect.',
        errorType: 'authentication',
      });

      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('builder_session_error');

          return next;
        },
        { replace: true },
      );
    }, [searchParams, setSearchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages]);

    useEffect(() => {
      if (!hasIndobaseStudioHandoff(indobaseConn)) {
        return;
      }

      void ensureBuilderSession().then((restored) => {
        if (restored) {
          void useMCPStore.getState().initialize();
          void useMCPStore.getState().syncWithIndobaseConnection();
          void runStudioBackendPreflight(indobaseConn).then((preflight) => {
            if (!preflight.ready && preflight.error) {
              toast.warning(preflight.error);
            }
          });
        }
      });
    }, [
      indobaseConn.connectionSource,
      indobaseConn.indobase?.mcpToken,
      indobaseConn.credentials?.anonKey,
      indobaseConn.credentials?.apiUrl,
    ]);

    useEffect(() => {
      if (!hasIndobaseStudioHandoff(indobaseConn)) {
        return;
      }

      void import('~/lib/webcontainer').then(async ({ getWebcontainer }) => {
        const container = await getWebcontainer();
        await seedProjectEnvIfMissing(
          (filePath, content) => container.fs.writeFile(filePath, content),
          (filePath) => container.fs.readFile(filePath, 'utf-8'),
          indobaseConn,
        );
      });
    }, [
      indobaseConn.connectionSource,
      indobaseConn.credentials?.anonKey,
      indobaseConn.credentials?.apiUrl,
      indobaseConn.indobase?.projectRef,
    ]);

    useEffect(() => {
      if (!isIndobaseStudioManagedConnection(indobaseConn)) {
        return;
      }

      /*
       * Only approve once the stream is idle. Approving mid-stream is worse than useless: the
       * streaming protocol rebuilds the last message from server chunks on every update, which
       * overwrites our client-side 'result' back to 'call' — and the dedup ref then blocks
       * re-approval forever, stranding the build behind a "Run tool" button. Approving when idle
       * also makes useChat trigger the continuation request that actually executes the tool.
       */
      if (isLoading) {
        return;
      }

      /*
       * The server emits the toolCall annotation via dataStream.writeMessageAnnotation(), which
       * lands on the MESSAGE's annotations — not on the useChat `data` stream (that is fed by
       * writeData). Reading it from chatData never matched, so auto-approve never fired and every
       * Indobase MCP call sat waiting behind a manual "Run tool" button, stalling the build.
       * Collect from both channels so it works regardless of which one carries it.
       */
      const collectToolAnnotations = (entries: unknown): ToolCallAnnotation[] =>
        (Array.isArray(entries) ? entries : []).filter(
          (entry) => typeof entry === 'object' && entry !== null && (entry as ToolCallAnnotation).type === 'toolCall',
        ) as ToolCallAnnotation[];

      const streamToolAnnotations = collectToolAnnotations(chatData);

      /*
       * addToolResult() can only resolve tool calls on the LAST message — approving older
       * messages' calls is a silent no-op, so don't bother (persisted chats close those out at
       * load time in useChatHistory).
       */
      const message = messages[messages.length - 1];

      if (!message || message.role !== 'assistant' || !message.parts) {
        return;
      }

      const toolAnnotations = [
        ...streamToolAnnotations,
        ...collectToolAnnotations((message as { annotations?: unknown }).annotations),
      ];

      for (const part of message.parts) {
        if (part.type !== 'tool-invocation' || part.toolInvocation.state !== 'call') {
          continue;
        }

        const toolCallId = part.toolInvocation.toolCallId;
        const annotation = toolAnnotations.find((entry) => entry.toolCallId === toolCallId);

        /*
         * Fail open on a Studio-linked session: the MCP server is one we configured ourselves,
         * so a missing/incomplete annotation must not strand the build waiting for a click.
         */
        const isIndobaseTool = annotation ? annotation.serverName === INDOBASE_MCP_SERVER_NAME : true;

        if (isIndobaseTool) {
          addToolResult({
            toolCallId,
            result: TOOL_EXECUTION_APPROVAL.APPROVE,
          });
        }
      }
    }, [messages, chatData, indobaseConn, addToolResult, isLoading]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      // Mark aborted first so in-flight onFinish/pipeline callbacks see it immediately.
      chatStore.setKey('aborted', true);
      stop();
      setFakeLoading(false);
      streamingState.set(false);
      failInitialBuild();
      void workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    /*
     * useChat's stop() does not reliably clear isLoading once the stream is already dead, which
     * left the composer locked on "Agent is working…" — the user could not retry, contradicting
     * the error we show them. This flag overrides the streaming state until the next send.
     */
    const [streamStalled, setStreamStalled] = useState(false);

    /*
     * Post-codegen finalize + bounded automatic repair. Runs after every completed build stream
     * AND after a stalled/dead stream: flush parsed actions, boot install+dev if needed, verify
     * the preview is actually healthy, and on failure feed the exact diagnostics back through a
     * focused quota-exempt repair turn (max MAX_AUTOMATIC_PREVIEW_REPAIRS). Returns true when the
     * build ended healthy or a repair turn was dispatched.
     */
    const finalizeBuildAndMaybeRepair = useCallback(
      async (isInitialBuild: boolean): Promise<boolean> => {
        const MAX_TRANSIENT_FINALIZE_RETRIES = 2;
        const TRANSIENT_FINALIZE_RETRY_DELAY_MS = 3_000;
        let transientRetries = 0;

        try {
          await processSampledMessages.flush();
          await persistSampledHistory.flush();

          if (chatMode !== 'build') {
            return true;
          }

          /*
           * No WebContainer on this host (no API key) — finalizeCodegen boots it, so it can only
           * fail here. Build on the server and host the result instead of burning a boot attempt
           * and then recovering from the exception.
           */
          if (isServerPreviewMode()) {
            const draft = await publishDraftPreview(indobaseConnection.get());

            if (draft.success && draft.previewUrl) {
              setLlmErrorAlert(undefined);

              if (isInitialBuild) {
                initialBuildLifecycle.set('preview-ready');
              }

              return true;
            }

            if (isInitialBuild) {
              failInitialBuild();
            }

            logger.error('Server preview build failed', draft.error);

            return true;
          }

          while (true) {
            // Start server draft in parallel with WebContainer finalize — draft is usually faster.
            const draftPromise = publishDraftPreview(indobaseConnection.get());

            try {
              await finalizeCodegen();
              automaticPreviewRepairAttemptRef.current = 0;
              setLlmErrorAlert(undefined);

              if (isInitialBuild) {
                initialBuildLifecycle.set('preview-ready');
              }

              void draftPromise;

              return true;
            } catch (error) {
              logger.error('Post-codegen finalize failed', error);

              try {
                const draft = await draftPromise;

                if (draft.success && draft.previewUrl) {
                  automaticPreviewRepairAttemptRef.current = 0;
                  setLlmErrorAlert(undefined);

                  if (isInitialBuild) {
                    initialBuildLifecycle.set('preview-ready');
                  }

                  return true;
                }
              } catch (draftError) {
                logger.warn('Draft preview recovery failed', draftError);
              }

              const repair = decideAutomaticPreviewRepair({
                error,
                completedAttempts: automaticPreviewRepairAttemptRef.current,
                files: workbenchStore.files.get(),
                maxAttempts: MAX_AUTOMATIC_PREVIEW_REPAIRS,
              });

              /*
               * Transient preview/network flakiness is not model-repairable and does not consume
               * the repair budget — wait briefly and re-run finalize instead of a repair turn.
               */
              if (
                !repair.shouldRepair &&
                repair.reason === 'transient' &&
                transientRetries < MAX_TRANSIENT_FINALIZE_RETRIES
              ) {
                transientRetries += 1;
                logger.warn(
                  `Transient preview error; retrying finalize (${transientRetries}/${MAX_TRANSIENT_FINALIZE_RETRIES})`,
                );
                await new Promise((resolve) => setTimeout(resolve, TRANSIENT_FINALIZE_RETRY_DELAY_MS));
                continue;
              }

              /*
               * Persistent transient-only failures with a loaded preview iframe: fail open rather
               * than telling the user a healthy app is broken.
               */
              if (!repair.shouldRepair && repair.reason === 'transient') {
                logger.warn('Persistent transient preview errors; treating loaded preview as healthy');
                setLlmErrorAlert(undefined);
                workbenchStore.clearAlert();

                if (isInitialBuild) {
                  initialBuildLifecycle.set('preview-ready');
                }

                return true;
              }

              if (repair.shouldRepair) {
                automaticPreviewRepairAttemptRef.current = repair.nextAttempt;
                setLlmErrorAlert(undefined);

                // A prior stall/abort must not block the repair turn from streaming.
                chatStore.setKey('aborted', false);
                setStreamStalled(false);
                initialBuildLifecycle.set('finalizing');
                append({
                  role: 'user',
                  content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${repair.prompt}`,
                });

                return true;
              }

              failInitialBuild();
              setLlmErrorAlert({
                type: 'error',
                title: 'Automatic repair could not fix the preview',
                description:
                  error instanceof Error
                    ? `${error.message}\n\nTried ${automaticPreviewRepairAttemptRef.current} focused repairs.`
                    : `The generated files finished, but the preview remained unhealthy after ${automaticPreviewRepairAttemptRef.current} focused repairs.`,
                errorType: 'unknown',
              });

              return false;
            }
          }
        } finally {
          setFakeLoading(false);
          streamingState.set(false);
        }
      },
      [append, chatMode, model, provider.name],
    );

    /*
     * Stall watchdog. If the SSE stream drops mid-generation (proxy timeout, provider hang-up) the
     * AI SDK fires neither onError nor onFinish, so isLoading stays true and the composer shows
     * "Agent is working…" forever with no way to tell the build is dead. Detect no-progress, then
     * in build mode salvage the partial output through finalize + bounded automatic repair; only
     * surface a retryable error when that path cannot recover.
     */
    const STREAM_STALL_TIMEOUT_MS = 120_000;
    const lastStreamProgressRef = useRef<number>(Date.now());
    const streamProgressMarker = useRef<string>('');

    useEffect(() => {
      if (!isLoading) {
        lastStreamProgressRef.current = Date.now();
        return undefined;
      }

      /*
       * Growth in the transcript OR real data-stream annotations counts as progress (planner/
       * summary phases stream no message text for minutes). Keepalive pings are excluded — they
       * arrive every 20s forever, so counting them meant a dead model stream never tripped this
       * watchdog and the build sat on "Agent is working…" indefinitely.
       */
      const marker = computeStreamProgressMarker(messages, chatData);

      if (marker !== streamProgressMarker.current) {
        streamProgressMarker.current = marker;
        lastStreamProgressRef.current = Date.now();
      }

      const timer = window.setInterval(() => {
        if (Date.now() - lastStreamProgressRef.current < STREAM_STALL_TIMEOUT_MS) {
          return;
        }

        window.clearInterval(timer);
        logger.error('Stream stalled with no progress; treating as a failed generation');
        stop();
        void workbenchStore.abortAllActions();

        if (chatMode === 'build') {
          const isInitialBuild = ['generating', 'finalizing'].includes(initialBuildLifecycle.get());
          logger.warn('Build stream stalled; attempting finalize + bounded automatic repair');
          chatStore.setKey('aborted', false);
          void finalizeBuildAndMaybeRepair(isInitialBuild).then((recovered) => {
            if (!recovered) {
              setStreamStalled(true);
            }
          });

          return;
        }

        setFakeLoading(false);
        streamingState.set(false);
        setStreamStalled(true);
        chatStore.setKey('aborted', true);
        setLlmErrorAlert({
          type: 'error',
          title: 'Generation stopped unexpectedly',
          description:
            'The AI stopped responding partway through (the connection dropped). Nothing was lost — send your prompt again to retry.',
          errorType: 'network',
        });
      }, 10_000);

      return () => window.clearInterval(timer);
    }, [isLoading, messages, chatData, stop, chatMode, finalizeBuildAndMaybeRepair]);

    const handleError = useCallback(
      (error: any, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
        // A user-initiated Stop surfaces here as an AbortError; never auto-retry it.
        if (chatStore.get().aborted || error?.name === 'AbortError') {
          logger.debug(`${context} request aborted by user`);
          setFakeLoading(false);
          streamingState.set(false);

          return;
        }

        logger.error(`${context} request failed`, error);

        stop();
        setFakeLoading(false);

        let errorInfo: {
          message: string;
          isRetryable: boolean;
          statusCode: number;
          provider: string;
          type: 'unknown';
          retryDelay: number;
          upgradeUrl?: string;
          errorType?: string;
        } = {
          message: 'An unexpected error occurred',
          isRetryable: true,
          statusCode: 500,
          provider: provider.name,
          type: 'unknown',
          retryDelay: 0,
        };

        if (error.message) {
          try {
            const parsed = JSON.parse(error.message);

            if (parsed.error || parsed.message) {
              errorInfo = { ...errorInfo, ...parsed };
            } else {
              errorInfo.message = error.message;
            }
          } catch {
            errorInfo.message = error.message;
          }
        }

        if (errorInfo.message.toLowerCase().includes('unauthorized')) {
          errorInfo.statusCode = 401;
        }

        let errorType: LlmErrorAlertType['errorType'] = 'unknown';
        let title = 'Request Failed';

        if (errorInfo.statusCode === 401 || errorInfo.message.toLowerCase().includes('api key')) {
          if (
            errorInfo.statusCode === 401 &&
            (isIndobaseStudioManagedConnection(indobaseConn) ||
              errorInfo.message.toLowerCase().includes('unauthorized'))
          ) {
            void ensureBuilderSession({ retries: 2 }).then((restored) => {
              if (!restored && !getStoredBuilderMcpToken()) {
                toast.error('Connect via Studio to build. Opening Studio sign-in…');
                redirectToStudioBuilderConnect(undefined, pendingBuildPromptRef.current);
              } else if (!restored) {
                toast.error('Could not refresh the builder session. Check your connection and try again.');
              }
            });
            return;
          }

          errorType = 'authentication';
          title = 'Authentication Error';
        } else if (errorInfo.statusCode === 429 || errorInfo.message.toLowerCase().includes('rate limit')) {
          errorType = 'rate_limit';
          title = 'Rate Limit Exceeded';
        } else if (errorInfo.statusCode === 402 || errorInfo.errorType === 'quota') {
          errorType = 'quota';
          title = 'Free Builder Limit Reached';
          errorInfo.message =
            errorInfo.message ||
            'You have used all 5 free prompts. Upgrade to Pro for unlimited build and discuss messages with agent orchestration.';
        } else if (errorInfo.message.toLowerCase().includes('quota')) {
          errorType = 'quota';
          title = 'Quota Exceeded';
        } else if (errorInfo.statusCode >= 500) {
          errorType = 'network';
          title = 'Server Error';
        } else if (
          /failed to fetch|networkerror|network error|stream was interrupted|load failed|econnreset/i.test(
            errorInfo.message,
          )
        ) {
          errorType = 'network';
          title = 'Connection Interrupted';
        }

        logStore.logError(`${context} request failed`, error, {
          component: 'Chat',
          action: 'request',
          error: errorInfo.message,
          context,
          retryable: errorInfo.isRetryable,
          errorType,
          provider: provider.name,
        });

        if (
          context === 'chat' &&
          chatMode === 'build' &&
          errorInfo.isRetryable &&
          errorType !== 'quota' &&
          errorType !== 'authentication' &&
          orchestratorChatRetryRef.current < MAX_ORCHESTRATOR_CHAT_RETRIES
        ) {
          orchestratorChatRetryRef.current += 1;
          setLlmErrorAlert(undefined);

          const projectGoal =
            description.get()?.trim() ||
            messages
              .find(
                (entry) =>
                  entry.role === 'user' &&
                  typeof entry.content === 'string' &&
                  !entry.content.includes(ORCHESTRATOR_REPAIR_USER_PREFIX),
              )
              ?.content?.replace(/\[Model:[^\]]*\]\s*/g, '')
              ?.replace(/\[Provider:[^\]]*\]\s*/g, '')
              ?.trim() ||
            'the current project';
          append({
            role: 'user',
            content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${ORCHESTRATOR_REPAIR_USER_PREFIX}${title}: ${errorInfo.message}

Continue building ${projectGoal} wired to the linked Indobase backend. Fix any issues and keep existing files unless a change is required.`,
          });

          return;
        }

        capturePostHogException(error, {
          context,
          error_type: errorType,
          status_code: errorInfo.statusCode,
          provider: provider.name,
          chat_mode: chatMode,
        });

        // Create API error alert
        setLlmErrorAlert({
          type: 'error',
          title,
          description: errorInfo.message,
          provider: provider.name,
          errorType,
          upgradeUrl: resolveUpgradeUrl(errorInfo.upgradeUrl),
        });
        setData([]);
      },
      [
        provider.name,
        stop,
        indobaseConn,
        resolveUpgradeUrl,
        chatMode,
        model,
        append,
        messages,
        MAX_ORCHESTRATOR_CHAT_RETRIES,
      ],
    );

    const clearApiErrorAlert = useCallback(() => {
      setLlmErrorAlert(undefined);
    }, []);

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    // Helper function to create message parts array from text and images
    const createMessageParts = (text: string, images: string[] = []): Array<TextUIPart | FileUIPart> => {
      // Create an array of properly typed message parts
      const parts: Array<TextUIPart | FileUIPart> = [
        {
          type: 'text',
          text,
        },
      ];

      // Add image parts if any
      images.forEach((imageData) => {
        // Extract correct MIME type from the data URL
        const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';

        // Create file part according to AI SDK format
        parts.push({
          type: 'file',
          mimeType,
          data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
        });
      });

      return parts;
    };

    // Helper function to convert File[] to Attachment[] for AI SDK
    const filesToAttachments = async (files: File[]): Promise<Attachment[] | undefined> => {
      if (files.length === 0) {
        return undefined;
      }

      const attachments = await Promise.all(
        files.map(
          (file) =>
            new Promise<Attachment>((resolve) => {
              const reader = new FileReader();

              reader.onloadend = () => {
                resolve({
                  name: file.name,
                  contentType: file.type,
                  url: reader.result as string,
                });
              };
              reader.readAsDataURL(file);
            }),
        ),
      );

      return attachments;
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || input;

      if (!messageContent?.trim()) {
        return;
      }

      // Starting a new generation clears any previous stall so this run is tracked fresh.
      automaticPreviewRepairAttemptRef.current = 0;
      setStreamStalled(false);
      lastStreamProgressRef.current = Date.now();
      streamProgressMarker.current = '';

      // Remember the raw prompt so a Studio auth redirect mid-submit can replay it after handoff.
      pendingBuildPromptRef.current = messageContent;

      /*
       * Top of the build funnel. Length only — never the prompt text itself, which is user content
       * and would put customer product ideas into analytics.
       */
      generationStartedAtRef.current = Date.now();
      capturePostHogEvent(BUILDER_EVENTS.promptSubmitted, {
        prompt_length: messageContent.length,
        chat_mode: chatMode,
        model,
        provider: provider.name,
        is_first_message: !chatStarted,
      });

      /*
       * Composer command: `/connect [url] [anonKey]` — link a backend without
       * leaving the chat. With a URL + anon key it connects directly; bare
       * `/connect` opens the Studio flow.
       */
      const trimmedInput = messageContent.trim();

      if (trimmedInput === '/connect' || trimmedInput.toLowerCase().startsWith('/connect ')) {
        const parts = trimmedInput.split(/\s+/);

        if (parts.length >= 3 && /^https?:\/\//.test(parts[1])) {
          const apiUrl = parts[1].replace(/\/+$/, '');
          const anonKey = parts[2];
          const projectRef = apiUrl.replace(/^https?:\/\//, '').split('.')[0] || 'indobase';

          updateIndobaseConnection({
            credentials: { apiUrl, anonKey, projectRef },
            selectedProjectId: projectRef,
            connectionSource: 'manual',
          });
          toast.success('Connected to your Indobase backend');
        } else {
          toast.info('Opening Studio to connect your backend…');
          redirectToStudioBuilderConnect();
        }

        setInput('');

        return;
      }

      if (hasIndobaseStudioHandoff(indobaseConn)) {
        const ready = await prepareStudioLinkedChat();

        if (!ready) {
          toast.error('Builder session expired. Reconnecting through Studio…');
          redirectToStudioBuilderConnect(undefined, pendingBuildPromptRef.current);

          return;
        }
      }

      if (isLoading) {
        abort();
        return;
      }

      if (builderPromptQuota?.isFree && builderPromptQuota.remaining !== null && builderPromptQuota.remaining <= 0) {
        const upgradeUrl = resolveUpgradeUrl(builderPromptQuota.upgradeUrl);
        setLlmErrorAlert({
          type: 'error',
          title: 'Free Builder Limit Reached',
          description:
            'You have used all 5 free prompts. Upgrade to Pro for unlimited build and discuss messages with agent orchestration.',
          errorType: 'quota',
          upgradeUrl,
        });

        return;
      }

      let finalMessageContent = messageContent;

      if (
        hasIndobaseStudioHandoff(indobaseConn) &&
        !chatStarted &&
        !finalMessageContent.includes('INDOBASE BACKEND (Studio-linked')
      ) {
        const schemaBlock = await getStudioSchemaPreamble(indobaseConn);
        finalMessageContent = `${wrapStudioContext(`${getStudioBackendUserPreamble()}${schemaBlock}`)}${finalMessageContent}`;
      }

      if (selectedElement) {
        console.log('Selected Element:', selectedElement);

        const elementInfo = `<div class=\"__boltSelectedElement__\" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;

        /*
         * Append to finalMessageContent so the Studio backend preamble + live schema (prepended
         * above) survive; overwriting with messageContent here dropped that context.
         */
        finalMessageContent = finalMessageContent + elementInfo;
      }

      runAnimation();

      // A fresh send always clears any previous Stop so streaming and the autonomous flow can run.
      chatStore.setKey('aborted', false);

      if (!chatStarted) {
        setFakeLoading(true);

        if (chatMode === 'build') {
          beginInitialBuild();
        }

        try {
          // Always build from the user prompt via the model — no starter-template import.
          const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;
          const attachments = uploadedFiles.length > 0 ? await filesToAttachments(uploadedFiles) : undefined;

          setMessages([
            {
              id: `${new Date().getTime()}`,
              role: 'user',
              content: userMessageText,
              parts: createMessageParts(userMessageText, imageDataList),
              experimental_attachments: attachments,
            },
          ]);
          reload(attachments ? { experimental_attachments: attachments } : undefined);
          setInput('');
          Cookies.remove(PROMPT_COOKIE_KEY);

          setUploadedFiles([]);
          setImageDataList([]);

          resetEnhancer();

          textareaRef.current?.blur();

          return;
        } finally {
          setFakeLoading(false);
          streamingState.set(false);
        }
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userUpdateArtifact}${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
          },
          attachmentOptions,
        );

        workbenchStore.resetAllFileModifications();
      } else {
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
          },
          attachmentOptions,
        );
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    const handleWebSearchResult = useCallback(
      (result: string) => {
        const currentInput = input || '';
        const newInput = currentInput.length > 0 ? `${result}\n\n${currentInput}` : result;

        // Update the input via the same mechanism as handleInputChange
        const syntheticEvent = {
          target: { value: newInput },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(syntheticEvent);
      },
      [input, handleInputChange],
    );

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={(isLoading || fakeLoading) && !streamStalled}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        model={model}
        provider={provider}
        setProvider={handleProviderChange}
        handleInputChange={(e) => {
          onTextareaChange(e);
          debouncedCachePrompt(e);
        }}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || '',
          };
        })}
        sourceMessages={messages}
        enhancePrompt={() => {
          enhancePrompt(
            input,
            (input) => {
              setInput(input);
              scrollTextArea();
            },
            model,
            provider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        indobaseBackendAlert={indobaseBackendAlert}
        clearIndobaseBackendAlert={() => workbenchStore.clearIndobaseBackendAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        llmErrorAlert={llmErrorAlert}
        clearLlmErrorAlert={clearApiErrorAlert}
        builderPromptQuota={builderPromptQuota}
        upgradeUrl={resolveUpgradeUrl(builderPromptQuota?.upgradeUrl)}
        data={chatData}
        chatMode={chatMode}
        setChatMode={setChatMode}
        append={append}
        designScheme={designScheme}
        setDesignScheme={setDesignScheme}
        selectedElement={selectedElement}
        setSelectedElement={setSelectedElement}
        addToolResult={addToolResult}
        onWebSearchResult={handleWebSearchResult}
      />
    );
  },
);
