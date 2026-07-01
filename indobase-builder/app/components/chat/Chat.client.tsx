import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts, parseAssistantMessage } from '~/lib/hooks';
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
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { resolveTemplateFromMessage } from '~/lib/indobase/resolveTemplateFromMessage';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseConnection } from '~/lib/stores/supabase';
import { useMCPStore } from '~/lib/stores/mcp';
import { defaultDesignScheme, type DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { runAutonomousPipeline } from '~/lib/orchestration/autonomous-runner';
import { ORCHESTRATOR_REPAIR_USER_PREFIX } from '~/lib/orchestration/prompts';
import { usePendingDeploy } from '~/lib/hooks/usePendingDeploy';
import type { ProgressAnnotation } from '~/types/context';
import { INDOBASE_MCP_SERVER_NAME } from '~/lib/indobase/mcp';
import { isIndobaseStudioManagedConnection } from '~/lib/indobase/connection';
import { finalizeCodegen } from '~/lib/indobase/finalizeCodegen';
import { getWebcontainerWithRetry } from '~/lib/webcontainer';
import { seedProjectEnvIfMissing } from '~/lib/indobase/seedProjectEnv';
import {
  ensureBuilderSession,
  getBuilderRequestInit,
  redirectToStudioBuilderConnect,
} from '~/lib/indobase/builder-auth.client';
import { TOOL_EXECUTION_APPROVAL } from '~/utils/constants';
import type { ToolCallAnnotation } from '~/types/context';
import type { TextUIPart, FileUIPart, Attachment } from '@ai-sdk/ui-utils';
import type { LlmErrorAlertType } from '~/types/actions';
import type { BuilderPromptQuotaState } from '~/types/builder-quota';

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
const DEFAULT_CHAT_PROVIDER =
  // OpenRouter has the configured key and serves DEFAULT_MODEL; OpenAI does not.
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

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
    </>
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
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
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
    const supabaseConn = useStore(supabaseConnection);
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();
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
    const [autonomousProgress, setAutonomousProgress] = useState<ProgressAnnotation[]>([]);
    const autonomousRepairCountRef = useRef(0);
    const orchestratorChatRetryRef = useRef(0);
    const runAutonomousDeployFlowRef = useRef<() => Promise<void>>(async () => {});
    const suppressAutonomousOnNextFinishRef = useRef(false);
    const MAX_AUTONOMOUS_REPAIRS = 10;
    const MAX_ORCHESTRATOR_CHAT_RETRIES = 8;
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const refreshBuilderPromptQuota = useCallback(async () => {
      if (!isIndobaseStudioManagedConnection(supabaseConn)) {
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
    }, [supabaseConn]);

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

        const studioUrl = builderPromptQuota?.studioUrl || supabaseConn.indobase?.studioUrl;

        if (!studioUrl) {
          return upgradePath;
        }

        return new URL(upgradePath, `${studioUrl.replace(/\/+$/, '')}/`).toString();
      },
      [builderPromptQuota?.studioUrl, supabaseConn.indobase?.studioUrl],
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
        supabase: {
          isConnected: supabaseConn.isConnected ?? false,
          hasSelectedProject: !!selectedProject,
          connectionSource: supabaseConn.connectionSource,
          credentials: {
            supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
            anonKey: supabaseConn?.credentials?.anonKey,
          },
          indobase: supabaseConn.indobase
            ? {
                apiUrl: supabaseConn.indobase.apiUrl,
                authUrl: supabaseConn.indobase.authUrl,
                projectRef: supabaseConn.indobase.projectRef,
                restUrl: supabaseConn.indobase.restUrl,
                storageUrl: supabaseConn.indobase.storageUrl,
                studioUrl: supabaseConn.indobase.studioUrl,
              }
            : undefined,
        },
        maxLLMSteps: mcpSettings.maxLLMSteps,
        multiAgentMode: chatMode === 'build',
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        setFakeLoading(false);
        handleError(e, 'chat');
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

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

        void refreshBuilderPromptQuota();

        if (suppressAutonomousOnNextFinishRef.current) {
          suppressAutonomousOnNextFinishRef.current = false;
          return;
        }

        void runAutonomousDeployFlowRef.current();
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });

    const runAutonomousDeployFlow = useCallback(async () => {
      if (chatMode !== 'build' || chatStore.get().aborted) {
        return;
      }

      try {
        await processSampledMessages.flush();
        await finalizeCodegen();
      } catch (error) {
        logger.error('Post-codegen finalize failed', error);
      }

      try {
        const result = await runAutonomousPipeline({
          connection: supabaseConn,
          onProgress: (progress) => {
            setAutonomousProgress((current) => [...current, progress]);
          },
        });

        if (result.needsRepair && result.repairPrompt) {
          if (autonomousRepairCountRef.current >= MAX_AUTONOMOUS_REPAIRS) {
            toast.error('Autonomous verification failed after multiple repair attempts.');
            autonomousRepairCountRef.current = 0;
            return;
          }

          autonomousRepairCountRef.current += 1;
          append({
            role: 'user',
            content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${result.repairPrompt}`,
          });
          return;
        }

        autonomousRepairCountRef.current = 0;
        orchestratorChatRetryRef.current = 0;

        if (result.deployUrl) {
          toast.success(`Deployed to ${result.deployUrl}`);
        }
      } catch (error) {
        logger.error('Autonomous pipeline failed', error);
        toast.error('Autonomous test/deploy pipeline failed.');
      }
    }, [MAX_AUTONOMOUS_REPAIRS, append, chatMode, model, provider.name, supabaseConn]);

    useEffect(() => {
      runAutonomousDeployFlowRef.current = runAutonomousDeployFlow;
    }, [runAutonomousDeployFlow]);

    useEffect(() => {
      if (provider.name !== HIDDEN_CHAT_PROVIDER.name) {
        setProvider(HIDDEN_CHAT_PROVIDER as ProviderInfo);
      }
    }, [provider.name]);

    const urlPromptHandledRef = useRef(false);

    useEffect(() => {
      if (urlPromptHandledRef.current || chatStarted) {
        return;
      }

      const prompt = searchParams.get('prompt');
      if (!prompt) {
        return;
      }

      const shouldAutostart = searchParams.get('autostart') === '1';

      urlPromptHandledRef.current = true;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('prompt');
        next.delete('autostart');
        return next;
      }, { replace: true });

      if (shouldAutostart) {
        runAnimation();
        append({
          role: 'user',
          content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
        });
        return;
      }

      setInput(prompt);
      textareaRef.current?.focus();
    }, [append, chatStarted, model, provider, searchParams, setInput, setSearchParams]);

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
      if (!isIndobaseStudioManagedConnection(supabaseConn)) {
        return;
      }

      void ensureBuilderSession();
      void useMCPStore.getState().initialize();
      void useMCPStore.getState().syncWithIndobaseConnection();
    }, [supabaseConn.connectionSource, supabaseConn.indobase?.mcpToken]);

    useEffect(() => {
      if (!isIndobaseStudioManagedConnection(supabaseConn) || !chatStarted) {
        return;
      }

      void import('~/lib/webcontainer').then(async ({ getWebcontainer }) => {
        const container = await getWebcontainer();
        await seedProjectEnvIfMissing(
          (filePath, content) => container.fs.writeFile(filePath, content),
          (filePath) => container.fs.readFile(filePath, 'utf-8'),
          supabaseConn,
        );
      });
    }, [chatStarted, supabaseConn.connectionSource, supabaseConn.credentials?.anonKey, supabaseConn.credentials?.supabaseUrl]);

    useEffect(() => {
      if (!isIndobaseStudioManagedConnection(supabaseConn) || isLoading) {
        return;
      }

      const toolAnnotations = (chatData || []).filter(
        (entry) => typeof entry === 'object' && (entry as ToolCallAnnotation).type === 'toolCall',
      ) as ToolCallAnnotation[];

      for (const message of messages) {
        if (message.role !== 'assistant' || !message.parts) {
          continue;
        }

        for (const part of message.parts) {
          if (part.type !== 'tool-invocation' || part.toolInvocation.state !== 'call') {
            continue;
          }

          const annotation = toolAnnotations.find(
            (entry) => entry.toolCallId === part.toolInvocation.toolCallId,
          );

          if (annotation?.serverName === INDOBASE_MCP_SERVER_NAME) {
            addToolResult({
              toolCallId: part.toolInvocation.toolCallId,
              result: TOOL_EXECUTION_APPROVAL.APPROVE,
            });
          }
        }
      }
    }, [messages, chatData, isLoading, supabaseConn, addToolResult]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    const handleError = useCallback(
      (error: any, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
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
            (isIndobaseStudioManagedConnection(supabaseConn) ||
              errorInfo.message.toLowerCase().includes('unauthorized'))
          ) {
            void ensureBuilderSession().then((restored) => {
              if (!restored) {
                toast.error('Builder session expired. Reconnecting through Studio…');
                redirectToStudioBuilderConnect();
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
          append({
            role: 'user',
            content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${ORCHESTRATOR_REPAIR_USER_PREFIX}${title}: ${errorInfo.message}

Continue building the ecommerce app (signup, signin, product catalog, cart, checkout) wired to the linked Indobase backend. Fix any issues and keep existing files unless a change is required.`,
          });
          return;
        }

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
      [provider.name, stop, supabaseConn, resolveUpgradeUrl, chatMode, model, append, MAX_ORCHESTRATOR_CHAT_RETRIES],
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

      if (isLoading) {
        abort();
        return;
      }

      if (
        builderPromptQuota?.isFree &&
        builderPromptQuota.remaining !== null &&
        builderPromptQuota.remaining <= 0
      ) {
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

      setAutonomousProgress([]);
      autonomousRepairCountRef.current = 0;

      let finalMessageContent = messageContent;

      if (selectedElement) {
        console.log('Selected Element:', selectedElement);

        const elementInfo = `<div class=\"__boltSelectedElement__\" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;
        finalMessageContent = messageContent + elementInfo;
      }

      runAnimation();

      if (!chatStarted) {
        setFakeLoading(true);

        const studioLinked = isIndobaseStudioManagedConnection(supabaseConn);
        const explicitTemplate = resolveTemplateFromMessage(finalMessageContent);
        let templateName = explicitTemplate?.name ?? null;
        let templateTitle = explicitTemplate ? finalMessageContent : '';

        if (!templateName && autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: finalMessageContent,
            model,
            provider,
            preferIndobase: studioLinked,
          });

          if (template !== 'blank') {
            templateName = template;
            templateTitle = title;
          }
        }

        if (templateName) {
          const templateMeta = explicitTemplate ?? resolveTemplateFromMessage(`Use the "${templateName}" template`);

          if (studioLinked && templateMeta && !templateMeta.indobaseReady && !templateMeta.indobaseAdaptable && !explicitTemplate) {
            templateName = null;
          }
        }

        if (templateName) {
          const temResp = await getTemplates(templateName, templateTitle || undefined).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage: templateFollowUp } = temResp;
              const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

              const templateMessages: Message[] = [
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: userMessageText,
                  parts: createMessageParts(userMessageText, imageDataList),
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
              ];

              setMessages(templateMessages);
              parseAssistantMessage(templateMessages[1]);

              try {
                await Promise.race([
                  (async () => {
                    await workbenchStore.flushPendingActions();
                    await workbenchStore.waitForExecutionQueue();
                  })(),
                  new Promise<void>((resolve) => {
                    window.setTimeout(resolve, 45_000);
                  }),
                ]);
              } catch (error) {
                logger.error('Template file import did not finish cleanly', error);
                toast.warning(
                  'Template files are still loading or WebContainer is slow. Open Workbench or hard-refresh if this persists.',
                );
              }

              setAutonomousProgress([]);
              autonomousRepairCountRef.current = 0;

              try {
                await getWebcontainerWithRetry(3);
              } catch (error) {
                logger.warn('WebContainer not ready before autonomous deploy; server build may still succeed', error);
              }

              void (async () => {
                try {
                  await runAutonomousDeployFlow();
                } catch (error) {
                  logger.error('Template autonomous deploy failed', error);
                }

                if (templateFollowUp?.trim()) {
                  suppressAutonomousOnNextFinishRef.current = true;
                  append({
                    role: 'user',
                    content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${templateFollowUp}`,
                  });
                }
              })();

              setInput('');
              Cookies.remove(PROMPT_COOKIE_KEY);

              setUploadedFiles([]);
              setImageDataList([]);

              resetEnhancer();

              textareaRef.current?.blur();
              setFakeLoading(false);

              return;
            }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
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
        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

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
        isStreaming={isLoading || fakeLoading}
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
        supabaseAlert={supabaseAlert}
        clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        llmErrorAlert={llmErrorAlert}
        clearLlmErrorAlert={clearApiErrorAlert}
        builderPromptQuota={builderPromptQuota}
        upgradeUrl={resolveUpgradeUrl(builderPromptQuota?.upgradeUrl)}
        data={chatData}
        extraProgress={autonomousProgress}
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
