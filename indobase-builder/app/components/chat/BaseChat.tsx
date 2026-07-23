/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { JSONValue, Message } from 'ai';
import React, { type RefCallback, useEffect, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { Messages } from './Messages.client';
import * as Tooltip from '@radix-ui/react-tooltip';
import styles from './BaseChat.module.scss';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import GitCloneButton from './GitCloneButton';
import type { ProviderInfo } from '~/types/model';
import type { ActionAlert, IndobaseBackendAlert, DeployAlert, LlmErrorAlertType } from '~/types/actions';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import ChatAlert from './ChatAlert';
import ProgressCompilation from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';
import { IndobaseBackendChatAlert } from '~/components/chat/IndobaseBackendChatAlert';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';
import { FallbackRecommendations } from './FallbackRecommendations';
import { ChatBox } from './ChatBox';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import LlmErrorAlert from './LLMApiAlert';
import { indobaseConnection } from '~/lib/stores/indobase-connection';
import type { BuilderPromptQuotaState } from '~/types/builder-quota';
import { BackendLinkBanner } from '~/components/indobase/BackendLinkBanner';
import { hasIndobaseStudioHandoff } from '~/lib/indobase/connection';
import { MyAppsList } from '~/components/chat/MyAppsList.client';
import { ChatPaneErrorBoundary } from './ChatPaneErrorBoundary';

const TEXTAREA_MIN_HEIGHT = 76;

/*
 * Stable default for the optional `extraProgress` prop. An inline `= []` default creates a new
 * array identity on every render, which re-fired the progress effect and re-set state each pass —
 * an infinite render loop that churned the whole chat tree during streaming (visible jitter).
 */
const NO_EXTRA_PROGRESS: ProgressAnnotation[] = [];

const PRECHAT_STARTER_PROMPTS = [
  {
    description: 'Admin panels, analytics, auth flows, and subscription UX.',
    prompt:
      'Build a SaaS dashboard with authentication, analytics charts, settings, and billing screens on my Indobase backend.',
    title: 'SaaS Dashboard',
  },
  {
    description: 'Email login, signup, and a protected home screen.',
    prompt:
      'Build an app with email login, signup, and a branded protected home dashboard for my product on Indobase.',
    title: 'Auth + App Shell',
  },
  {
    description: 'Launch pages with strong copy, sections, and CTAs.',
    prompt:
      'Build a marketing site with hero, pricing, and waitlist form for my AI startup, wired to Indobase.',
    title: 'Marketing Site',
  },
  {
    description: 'CRUD workflows, search, filters, and table-heavy screens.',
    prompt:
      'Build an internal operations tool with searchable tables, filters, and role-based access on Indobase.',
    title: 'Internal Tool',
  },
];

const STUDIO_LINKED_STARTER_PROMPT = {
  description: 'Describe your product; Builder generates and publishes to Indobase.',
  prompt:
    'Build a web app for my product on my linked Indobase backend with auth and a polished dashboard. After preview works, explain how to publish with Publish to Indobase.',
  title: 'Linked from Studio',
};

function buildProjectRecommendationPrompt(options: {
  projectName: string;
  projectRef?: string;
  connectionSource?: 'manual' | 'studio_handoff';
}) {
  const { projectName, projectRef, connectionSource } = options;
  const sourceLabel = connectionSource === 'studio_handoff' ? 'Studio-linked' : 'manual';

  return `Review my linked Indobase project and give me 3 concrete AI recommendations tailored to its current setup.

Project details:
- Name: ${projectName}
- Ref: ${projectRef || 'unknown'}
- Connection: ${sourceLabel}

For each recommendation:
1) Prioritize by impact (high/medium/low),
2) Explain why it matters for this project,
3) Give the best next step I should run in Builder.

Focus on practical improvements across product UX, backend integration, and launch readiness.
Do not make any code or schema changes yet.`;
}

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  /** Unparsed assistant messages — used to decide whether to show fallback recommendation chips. */
  sourceMessages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  indobaseBackendAlert?: IndobaseBackendAlert;
  clearIndobaseBackendAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  llmErrorAlert?: LlmErrorAlertType;
  clearLlmErrorAlert?: () => void;
  data?: JSONValue[] | undefined;
  extraProgress?: ProgressAnnotation[];
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  append?: (message: Message) => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: (element: ElementInfo | null) => void;
  addToolResult?: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  onWebSearchResult?: (result: string) => void;
  builderPromptQuota?: BuilderPromptQuotaState | null;
  upgradeUrl?: string;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      provider,
      setProvider: _setProvider,
      providerList: _providerList,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      sourceMessages,
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      indobaseBackendAlert,
      clearIndobaseBackendAlert,
      llmErrorAlert,
      clearLlmErrorAlert,
      data,
      extraProgress = NO_EXTRA_PROGRESS,
      chatMode,
      setChatMode,
      append,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      addToolResult = () => undefined,
      onWebSearchResult,
      builderPromptQuota,
      upgradeUrl,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const expoUrl = useStore(expoUrlAtom);
    const indobaseConn = useStore(indobaseConnection);
    const backendAlert = indobaseBackendAlert;
    const clearBackendAlert = clearIndobaseBackendAlert;
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [examplesOpen, setExamplesOpen] = useState(false);
    const isStudioManagedConnection = hasIndobaseStudioHandoff(indobaseConn);
    // Connected via Studio handoff OR a manual project URL + anon key.
    const isBackendConnected = isStudioManagedConnection || Boolean(indobaseConn?.isConnected);

    useEffect(() => {
      if (expoUrl) {
        setQrModalOpen(true);
      }
    }, [expoUrl]);

    useEffect(() => {
      const progressList = (data || []).filter(
        (x) => typeof x === 'object' && (x as any).type === 'progress',
      ) as ProgressAnnotation[];
      setProgressAnnotations([...progressList, ...extraProgress]);
    }, [data, extraProgress]);
    useEffect(() => {
      console.log(transcript);
    }, [transcript]);

    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (sendMessage) {
        sendMessage(event, messageInput);
        setSelectedElement?.(null);

        if (recognition) {
          recognition.abort(); // Stop current recognition
          setTranscript(''); // Clear transcript
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const alertStack = (
      <div className="flex flex-col gap-2">
        {deployAlert && (
          <DeployChatAlert
            alert={deployAlert}
            clearAlert={() => clearDeployAlert?.()}
            postMessage={(message: string | undefined) => {
              sendMessage?.({} as any, message);
              clearBackendAlert?.();
            }}
          />
        )}
        {backendAlert && (
          <IndobaseBackendChatAlert
            alert={backendAlert}
            clearAlert={() => clearBackendAlert?.()}
            postMessage={(message) => {
              sendMessage?.({} as any, message);
              clearBackendAlert?.();
            }}
          />
        )}
        {actionAlert && (
          <ChatAlert
            alert={actionAlert}
            clearAlert={() => clearAlert?.()}
            postMessage={(message) => {
              sendMessage?.({} as any, message);
              clearAlert?.();
            }}
          />
        )}
        {llmErrorAlert && <LlmErrorAlert alert={llmErrorAlert} clearAlert={() => clearLlmErrorAlert?.()} />}
        {builderPromptQuota?.isFree && builderPromptQuota.limit !== null && (
          <div
            className={classNames(
              'mb-2 rounded-lg border p-3 text-sm transition-colors duration-200',
              builderPromptQuota.remaining === 0
                ? 'border-rose-200 bg-rose-50'
                : 'border-gray-200 bg-white/80',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-gray-700">
                {builderPromptQuota.remaining === 0 ? (
                  <>Free plan: all {builderPromptQuota.limit} prompts used.</>
                ) : (
                  <>
                    Free plan: {builderPromptQuota.remaining} of {builderPromptQuota.limit} prompts
                    remaining (build and discuss).
                  </>
                )}
              </p>
              {upgradeUrl && (
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-accent-500 px-2 py-1 text-sm font-medium text-white transition-colors duration-200 hover:brightness-95"
                >
                  Upgrade plan
                  <span className="i-ph:arrow-square-out h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    );

    const promptComposer = (embedded = false) => (
      <ChatBox
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        textareaRef={textareaRef}
        input={input}
        lastUserMessage={(() => {
          const last = [...(messages ?? [])].reverse().find((m: { role: string }) => m.role === 'user');
          const raw = typeof last?.content === 'string' ? last.content : '';
          return raw
            .replace(/\[Model:[^\]]*\]/g, '')
            .replace(/\[Provider:[^\]]*\]/g, '')
            .trim();
        })()}
        handleInputChange={handleInputChange}
        handlePaste={handlePaste}
        TEXTAREA_MIN_HEIGHT={TEXTAREA_MIN_HEIGHT}
        TEXTAREA_MAX_HEIGHT={TEXTAREA_MAX_HEIGHT}
        isStreaming={isStreaming}
        handleStop={handleStop}
        handleSendMessage={handleSendMessage}
        enhancingPrompt={enhancingPrompt}
        enhancePrompt={enhancePrompt}
        isListening={isListening}
        startListening={startListening}
        stopListening={stopListening}
        chatStarted={chatStarted}
        exportChat={exportChat}
        qrModalOpen={qrModalOpen}
        setQrModalOpen={setQrModalOpen}
        handleFileUpload={handleFileUpload}
        chatMode={chatMode}
        setChatMode={setChatMode}
        designScheme={designScheme}
        setDesignScheme={setDesignScheme}
        selectedElement={selectedElement}
        setSelectedElement={setSelectedElement}
        onWebSearchResult={onWebSearchResult}
        embedded={embedded}
      />
    );

    const handleStarterPromptClick = (event: React.UIEvent<HTMLButtonElement>, prompt: string) => {
      if (isStreaming) {
        handleStop?.();
        return;
      }

      handleSendMessage(event, prompt);
    };

    const handleProjectRecommendationClick = (event: React.UIEvent<HTMLButtonElement>) => {
      const projectName = indobaseConn.project?.name || indobaseConn.selectedProjectId || 'Linked project';
      const projectRef = indobaseConn.selectedProjectId || indobaseConn.indobase?.projectRef;

      setChatMode?.('discuss');
      handleStarterPromptClick(
        event,
        buildProjectRecommendationPrompt({
          projectName,
          projectRef,
          connectionSource: indobaseConn.connectionSource,
        }),
      );
    };

    const preChatLanding = (
      <div className="relative min-h-full text-gray-900">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pb-20 pt-16 sm:px-6 sm:pt-20">
          <h1 className="max-w-xl text-center text-[clamp(1.75rem,4.5vw,2.75rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-white drop-shadow-sm">
            Start with one prompt. You can change everything later.
          </h1>
          <p className="mt-3 max-w-lg text-center text-[15px] leading-6 text-white/90">
            {isBackendConnected
              ? 'Your Indobase backend is linked — describe the product and Builder builds it from scratch.'
              : 'Describe your idea. The AI builds it from your prompt — no starter templates.'}
          </p>

          <div className="mt-10 w-full max-w-[42rem]">
            {alertStack}
            {!isBackendConnected && <div className="mb-3"><BackendLinkBanner /></div>}
            {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}

            <div className="overflow-hidden rounded-[1.25rem] bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.22)] ring-1 ring-black/5">
              <div className="p-3 sm:p-4">{promptComposer(true)}</div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
                <div className="flex items-center gap-1">
                  {ImportButtons(importChat)}
                  <GitCloneButton
                    importChat={importChat}
                    className="!rounded-lg !border-transparent !bg-transparent !text-gray-500 hover:!bg-gray-100 hover:!text-gray-900"
                  />
                </div>
                <div className="flex items-center gap-3">
                  {isBackendConnected && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <span className="i-ph:check-circle-fill" />
                      Backend linked
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={isStreaming || !input?.trim()}
                    onClick={(event) => handleSendMessage(event)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Build
                    <span className="i-ph:arrow-right text-base" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setExamplesOpen((open) => !open)}
                className="text-sm font-medium text-white/90 underline-offset-2 hover:underline"
              >
                {examplesOpen ? 'Hide example ideas' : 'Example ideas'}
              </button>
            </div>

            {examplesOpen && (
              <div className="mt-4 rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-md">
                <div className="mb-3 text-sm font-semibold text-gray-900">Example prompts</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(isStudioManagedConnection
                    ? [STUDIO_LINKED_STARTER_PROMPT, ...PRECHAT_STARTER_PROMPTS]
                    : PRECHAT_STARTER_PROMPTS
                  ).map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={(event) => handleStarterPromptClick(event, item.prompt)}
                      className="rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-accent-400 hover:shadow-sm"
                    >
                      <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                      <div className="mt-1 text-xs leading-5 text-gray-500">{item.description}</div>
                    </button>
                  ))}
                </div>

                {isBackendConnected && (
                  <button
                    type="button"
                    disabled={isStreaming}
                    onClick={handleProjectRecommendationClick}
                    className="mt-4 w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm text-sky-900 transition hover:bg-sky-100 disabled:opacity-60"
                  >
                    Get tailored recommendations for this project
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-12 w-full">
            <ClientOnly>{() => <MyAppsList />}</ClientOnly>
          </div>
        </div>
      </div>
    );

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden')}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div
          className={classNames('flex h-full w-full flex-col overflow-y-auto lg:flex-row', {
            'bg-transparent': !chatStarted,
            'bg-[#F4F7FA] p-2 md:p-3': chatStarted,
          })}
        >
          <div
            className={classNames(
              styles.Chat,
              'flex h-full flex-grow flex-col lg:min-w-[var(--chat-min-width)]',
              chatStarted
                ? 'overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5'
                : '',
            )}
          >
            {!chatStarted ? (
              preChatLanding
            ) : (
              <StickToBottom
                className={classNames('relative px-2 pt-4 sm:px-4', {
                  'modern-scrollbar flex h-full flex-col': chatStarted,
                })}
                resize="smooth"
                initial="smooth"
              >
                <StickToBottom.Content className="relative flex flex-col gap-4">
                  <ClientOnly>
                    {() => {
                      return chatStarted ? (
                        <ChatPaneErrorBoundary>
                          <Messages
                            className="z-1 mx-auto flex w-full max-w-chat flex-1 flex-col pb-4"
                            messages={messages}
                            isStreaming={isStreaming}
                            append={append}
                            chatMode={chatMode}
                            setChatMode={setChatMode}
                            provider={provider}
                            model={model}
                            addToolResult={addToolResult}
                          />
                          <FallbackRecommendations
                            messages={sourceMessages ?? messages ?? []}
                            append={append}
                            model={model}
                            provider={provider}
                          />
                        </ChatPaneErrorBoundary>
                      ) : null;
                    }}
                  </ClientOnly>
                  <ScrollToBottom />
                </StickToBottom.Content>
                <div
                  className={classNames('z-prompt mx-auto mb-4 flex w-full max-w-chat flex-col gap-2', {
                    'sticky bottom-2': chatStarted,
                  })}
                >
                  {alertStack}
                  {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
                  {promptComposer()}
                </div>
              </StickToBottom>
            )}
          </div>
          <ClientOnly>
            {() =>
              chatStarted ? (
                <Workbench chatStarted={chatStarted} isStreaming={isStreaming} setSelectedElement={setSelectedElement} />
              ) : null
            }
          </ClientOnly>
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <>
        <div className="sticky bottom-0 left-0 right-0 z-10 h-20 bg-gradient-to-t from-white to-transparent" />
        <button
          className="sticky bottom-0 left-0 right-0 z-50 mx-auto flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-1.5 py-0.5 text-sm text-gray-800 shadow-sm backdrop-blur-sm transition-colors duration-200 hover:border-gray-300"
          onClick={() => scrollToBottom()}
        >
          Go to last message
          <span className="i-ph:arrow-down animate-bounce" />
        </button>
      </>
    )
  );
}
