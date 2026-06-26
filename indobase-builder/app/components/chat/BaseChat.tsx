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
import type { ActionAlert, SupabaseAlert, DeployAlert, LlmErrorAlertType } from '~/types/actions';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import ChatAlert from './ChatAlert';
import type { ModelInfo } from '~/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { useStore } from '@nanostores/react';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';
import { ChatBox } from './ChatBox';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import LlmErrorAlert from './LLMApiAlert';
import { supabaseConnection } from '~/lib/stores/supabase';

const TEXTAREA_MIN_HEIGHT = 76;

const PRECHAT_STARTER_PROMPTS = [
  {
    description: 'Admin panels, analytics, auth flows, and subscription UX.',
    prompt:
      'Build a SaaS dashboard with authentication, analytics charts, settings, and billing screens connected to my Indobase backend.',
    title: 'SaaS Dashboard',
  },
  {
    description: 'A polished product surface for users and teams.',
    prompt: 'Create a customer portal with onboarding, team management, notifications, and a clean responsive UI.',
    title: 'Customer Portal',
  },
  {
    description: 'Launch pages with strong copy, sections, and CTAs.',
    prompt: 'Design a modern landing page with pricing, testimonials, FAQs, and a waitlist form for an AI startup.',
    title: 'Marketing Site',
  },
  {
    description: 'CRUD workflows, search, filters, and table-heavy screens.',
    prompt:
      'Build an internal operations tool with searchable tables, task management, audit logs, and role-based access.',
    title: 'Internal Tool',
  },
];

const PRECHAT_FEATURED_TEMPLATES = [
  {
    icon: 'i-ph:chat-circle-dots',
    label: 'AI Chatbot',
    repoUrl: 'https://github.com/vercel/ai-chatbot.git',
  },
  {
    icon: 'i-ph:credit-card',
    label: 'Next.js SaaS Billing',
    repoUrl: 'https://github.com/vercel/nextjs-subscription-payments.git',
  },
  {
    icon: 'i-ph:shopping-cart',
    label: 'Next.js Commerce',
    repoUrl: 'https://github.com/vercel/commerce.git',
  },
  {
    icon: 'i-ph:squares-four',
    label: 'Admin Dashboard',
    repoUrl: 'https://github.com/vercel/nextjs-postgres-nextauth-tailwindcss-template.git',
  },
  {
    icon: 'i-ph:megaphone',
    label: 'Product Landing Page',
    repoUrl: 'https://github.com/vercel/nextjs-portfolio-starter.git',
  },
  {
    icon: 'i-ph:buildings',
    label: 'Multi-tenant Platform',
    repoUrl: 'https://github.com/vercel/platforms.git',
  },
];

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
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
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
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
      setModel,
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
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      llmErrorAlert,
      clearLlmErrorAlert,
      data,
      extraProgress = [],
      chatMode,
      setChatMode,
      append,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      addToolResult = () => undefined,
      onWebSearchResult,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>(undefined);
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const expoUrl = useStore(expoUrlAtom);
    const supabaseConn = useStore(supabaseConnection);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const isStudioManagedConnection = supabaseConn.connectionSource === 'studio_handoff';

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

    useEffect(() => {
      if (typeof window === 'undefined') {
        return;
      }

      const loadModels = () => {
        fetch('/api/models/OpenRouter')
          .then((response) => response.json())
          .then((data) => {
            const typedData = data as { modelList: ModelInfo[] };
            setModelList(typedData.modelList);
          })
          .catch((error) => {
            console.error('Error fetching model list:', error);
          })
          .finally(() => {
            setIsModelLoading(undefined);
          });
      };

      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(loadModels, { timeout: 8000 });
      } else {
        window.setTimeout(loadModels, 500);
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
              clearSupabaseAlert?.();
            }}
          />
        )}
        {supabaseAlert && (
          <SupabaseChatAlert
            alert={supabaseAlert}
            clearAlert={() => clearSupabaseAlert?.()}
            postMessage={(message) => {
              sendMessage?.({} as any, message);
              clearSupabaseAlert?.();
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
      </div>
    );

    const promptComposer = (
      <ChatBox
        model={model}
        setModel={setModel}
        modelList={modelList}
        isModelLoading={isModelLoading}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        textareaRef={textareaRef}
        input={input}
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
      />
    );

    const handleStarterPromptClick = (event: React.UIEvent<HTMLButtonElement>, prompt: string) => {
      if (isStreaming) {
        handleStop?.();
        return;
      }

      handleSendMessage(event, prompt);
    };

    const preChatLanding = (
      <div className="min-h-full bg-[#F7F4EF] text-[#18160F] dark:bg-[#16130F] dark:text-[#F8F3EA]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pb-20 pt-6 sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
            <div className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#E84718]">
              Indobase Builder
            </div>
            <h1 className="font-['Space_Grotesk'] text-[clamp(2.9rem,6.5vw,4.3rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#18160F] dark:text-[#F8F3EA]">
              Build with Indobase
            </h1>
            <p className="mt-5 max-w-2xl text-[15.5px] leading-7 text-[#6A6158] dark:text-[#B6ADA3]">
              {isStudioManagedConnection
                ? 'Your Indobase project is connected. Auth, database, storage, and edge functions run on your tenant backend automatically while you build.'
                : 'Design products with AI, wire them to your backend, and move into Studio when you need database, auth, storage, functions, and logs.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {isStudioManagedConnection && (
                <span className="inline-flex items-center rounded-full border border-[#C47800]/25 bg-[#C47800]/10 px-3 py-1 text-xs font-medium text-[#8A6500] dark:border-[#E7B24D]/25 dark:bg-[#E7B24D]/12 dark:text-[#F3C969]">
                  Connected to Indobase Backend
                </span>
              )}
            </div>

            <div className="mt-12 flex w-full max-w-[42rem] flex-col gap-4">
              {alertStack}
              {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
              {promptComposer}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {ImportButtons(importChat)}
              <GitCloneButton
                importChat={importChat}
                className="!rounded-lg !border-black/12 !bg-white !text-[#6A6158] hover:!border-black/18 hover:!bg-[#F1EDE6] hover:!text-[#18160F] dark:!border-white/12 dark:!bg-white/8 dark:!text-[#E5DED5] dark:hover:!border-white/18 dark:hover:!bg-white/10 dark:hover:!text-[#F8F3EA]"
              />
            </div>
          </div>

          <div id="builder-templates" className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-black/8 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-white/8 dark:bg-[#201B16]">
              <div className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#A09890] dark:text-[#8E857B]">
                Starter Prompts
              </div>
              <div className="mt-3 font-['Space_Grotesk'] text-[15.5px] font-semibold tracking-[-0.02em] text-[#18160F] dark:text-[#F8F3EA]">
                Start from a pattern
              </div>
              <p className="mt-1 text-sm leading-6 text-[#6A6158] dark:text-[#B6ADA3]">
                Common Indobase product shapes. Builder fills the implementation.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {PRECHAT_STARTER_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={(event) => handleStarterPromptClick(event, item.prompt)}
                    className="group relative rounded-xl border border-black/8 bg-[#F7F4EF] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#E84718]/25 hover:bg-white hover:shadow-[0_2px_10px_rgba(0,0,0,0.06)] dark:border-white/8 dark:bg-[#18130F] dark:hover:bg-[#221C16]"
                  >
                    <span className="pointer-events-none absolute right-3 top-3 text-xs text-[#E84718] opacity-0 transition group-hover:opacity-100">
                      <span className="i-ph:arrow-up-right" />
                    </span>
                    <div className="pr-5 font-['Space_Grotesk'] text-sm font-semibold tracking-[-0.015em] text-[#18160F] dark:text-[#F8F3EA]">
                      {item.title}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[#6A6158] dark:text-[#B6ADA3]">{item.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-black/8 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-white/8 dark:bg-[#201B16]">
              <div className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#A09890] dark:text-[#8E857B]">
                Start from a Proven Product
              </div>
              <div className="mt-3 font-['Space_Grotesk'] text-[15.5px] font-semibold tracking-[-0.02em] text-[#18160F] dark:text-[#F8F3EA]">
                Indobase-ready app shapes
              </div>
              <p className="mt-1 text-sm leading-6 text-[#6A6158] dark:text-[#B6ADA3]">
                Pick a template and refine the experience with Builder.
              </p>

              <div className="mt-5 flex items-center gap-2">
                <span className="rounded-md border border-[#C47800]/25 bg-[#C47800]/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[#C47800] dark:border-[#E7B24D]/25 dark:bg-[#E7B24D]/12 dark:text-[#F3C969]">
                  Featured
                </span>
                <span className="text-xs text-[#6A6158] dark:text-[#B6ADA3]">
                  Best first picks for most product requests
                </span>
              </div>

              <div className="mt-4 flex flex-col">
                {PRECHAT_FEATURED_TEMPLATES.map((template) => (
                  <a
                    key={template.label}
                    href={`/git?url=${encodeURIComponent(template.repoUrl)}`}
                    data-state="closed"
                    data-discover="true"
                    className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-[#F7F4EF] dark:hover:bg-[#18130F]"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#F1EDE6] text-[#6A6158] dark:bg-[#18130F] dark:text-[#B6ADA3]">
                      <span className={`${template.icon} text-[15px]`} />
                    </span>
                    <span className="text-sm font-medium text-[#6A6158] transition group-hover:text-[#18160F] dark:text-[#D5CEC5] dark:group-hover:text-[#F8F3EA]">
                      {template.label}
                    </span>
                    <span className="ml-auto text-xs text-[#A09890] opacity-0 transition group-hover:opacity-100 dark:text-[#8E857B]">
                      <span className="i-ph:arrow-right" />
                    </span>
                  </a>
                ))}
              </div>

              <div className="mt-4 border-t border-black/8 pt-4 dark:border-white/8">
                <a
                  href="/"
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#E84718] transition hover:opacity-75"
                >
                  Browse all starters
                  <span className="i-ph:arrow-right" />
                </a>
              </div>
            </div>
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
        <div className="flex flex-col lg:flex-row overflow-y-auto w-full h-full">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow lg:min-w-[var(--chat-min-width)] h-full')}>
            {!chatStarted ? (
              preChatLanding
            ) : (
              <StickToBottom
                className={classNames('pt-6 px-2 sm:px-6 relative', {
                  'h-full flex flex-col modern-scrollbar': chatStarted,
                })}
                resize="smooth"
                initial="smooth"
              >
                <StickToBottom.Content className="flex flex-col gap-4 relative ">
                  <ClientOnly>
                    {() => {
                      return chatStarted ? (
                        <Messages
                          className="flex flex-col w-full flex-1 max-w-chat pb-4 mx-auto z-1"
                          messages={messages}
                          isStreaming={isStreaming}
                          append={append}
                          chatMode={chatMode}
                          setChatMode={setChatMode}
                          provider={provider}
                          model={model}
                          addToolResult={addToolResult}
                        />
                      ) : null;
                    }}
                  </ClientOnly>
                  <ScrollToBottom />
                </StickToBottom.Content>
                <div
                  className={classNames('my-auto flex flex-col gap-2 w-full max-w-chat mx-auto z-prompt mb-6', {
                    'sticky bottom-2': chatStarted,
                  })}
                >
                  {alertStack}
                  {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
                  {promptComposer}
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
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-bolt-elements-background-depth-1 to-transparent h-20 z-10" />
        <button
          className="sticky z-50 bottom-0 left-0 right-0 text-4xl rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm"
          onClick={() => scrollToBottom()}
        >
          Go to last message
          <span className="i-ph:arrow-down animate-bounce" />
        </button>
      </>
    )
  );
}
