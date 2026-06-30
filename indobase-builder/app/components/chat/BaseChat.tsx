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
import { INDOBASE_STARTER_TEMPLATES } from '~/lib/indobase/indobaseTemplates';
import {
  CURATED_MOBILE_BOILERPLATES,
  CURATED_WEB_BOILERPLATES,
} from '~/lib/indobase/curatedBoilerplates';
import type { BuilderPromptQuotaState } from '~/types/builder-quota';

const TEXTAREA_MIN_HEIGHT = 76;

const PRECHAT_STARTER_PROMPTS = [
  {
    description: 'Admin panels, analytics, auth flows, and subscription UX.',
    prompt:
      'Use the "Indobase Dashboard" template and extend it into a SaaS dashboard with authentication, analytics charts, settings, and billing screens on my Indobase backend.',
    title: 'SaaS Dashboard',
  },
  {
    description: 'Email login, signup, and a protected home screen.',
    prompt:
      'Use the "Indobase Auth App" template and customize the branding, copy, and post-login dashboard for my product.',
    title: 'Auth + App Shell',
  },
  {
    description: 'Launch pages with strong copy, sections, and CTAs.',
    prompt:
      'Use the "Indobase Marketing Site" template and tailor the hero, pricing, and waitlist form for my AI startup.',
    title: 'Marketing Site',
  },
  {
    description: 'CRUD workflows, search, filters, and table-heavy screens.',
    prompt:
      'Use the "Indobase Todo App" template as a starting point and evolve it into an internal operations tool with searchable tables and role-based access.',
    title: 'Internal Tool',
  },
];

const STUDIO_LINKED_STARTER_PROMPT = {
  description: 'Start from the Indobase auth template, then publish from Builder.',
  prompt:
    'Use the "Indobase Auth App" template, connect it to my linked Indobase backend, and customize the dashboard for my product. After preview works, explain how to publish with Publish to Indobase.',
  title: 'Linked from Studio',
};

const PRECHAT_FEATURED_TEMPLATES = INDOBASE_STARTER_TEMPLATES.map((template) => ({
  icon: template.icon ?? 'i-ph:package',
  label: template.label,
  templateName: template.name,
  description: template.description,
}));

function mapBoilerplateButtons(templates: typeof CURATED_WEB_BOILERPLATES) {
  return templates.map((template) => ({
    icon: template.icon ?? 'i-ph:package',
    label: template.label,
    templateName: template.name,
    description: template.description,
  }));
}

const PRECHAT_WEB_BOILERPLATES = mapBoilerplateButtons(CURATED_WEB_BOILERPLATES);
const PRECHAT_MOBILE_BOILERPLATES = mapBoilerplateButtons(CURATED_MOBILE_BOILERPLATES);

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
        {builderPromptQuota?.isFree && builderPromptQuota.limit !== null && (
          <div
            className={classNames(
              'rounded-lg border p-3 mb-2 text-sm',
              builderPromptQuota.remaining === 0
                ? 'border-bolt-elements-button-danger-text/40 bg-bolt-elements-button-danger-text/10'
                : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-bolt-elements-textSecondary">
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
                  className="text-sm font-medium text-bolt-elements-button-primary-text bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover px-2 py-1 rounded-md inline-flex items-center gap-1"
                >
                  Upgrade to Pro
                  <span className="i-ph:arrow-square-out w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    );

    const promptComposer = (
      <ChatBox
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

    const handleTemplateClick = (event: React.UIEvent<HTMLButtonElement>, templateName: string) => {
      handleStarterPromptClick(
        event,
        `Use the "${templateName}" template and customize it for my product.`,
      );
    };

    const renderTemplateButtons = (
      templates: Array<{ icon: string; label: string; templateName: string; description: string }>,
    ) => (
      <div className="mt-3 flex flex-col">
        {templates.map((template) => (
          <button
            key={template.templateName}
            type="button"
            disabled={isStreaming}
            onClick={(event) => handleTemplateClick(event, template.templateName)}
            className="group flex items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-[#F7F4EF] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#18130F]"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#F1EDE6] text-[#6A6158] dark:bg-[#18130F] dark:text-[#B6ADA3]">
              <span className={`${template.icon} text-[15px]`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[#6A6158] transition group-hover:text-[#18160F] dark:text-[#D5CEC5] dark:group-hover:text-[#F8F3EA]">
                {template.label}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-[#A09890] dark:text-[#8E857B]">
                {template.description}
              </span>
            </span>
            <span className="ml-auto text-xs text-[#A09890] opacity-0 transition group-hover:opacity-100 dark:text-[#8E857B]">
              <span className="i-ph:arrow-right" />
            </span>
          </button>
        ))}
      </div>
    );

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

          <div id="builder-templates" className="grid gap-4 xl:grid-cols-2">
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
                {(isStudioManagedConnection
                  ? [STUDIO_LINKED_STARTER_PROMPT, ...PRECHAT_STARTER_PROMPTS]
                  : PRECHAT_STARTER_PROMPTS
                ).map((item) => (
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

              <div className="mt-4 flex flex-col">{renderTemplateButtons(PRECHAT_FEATURED_TEMPLATES)}</div>

              <div className="mt-6 border-t border-black/8 pt-5 dark:border-white/8">
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#A09890] dark:text-[#8E857B]">
                  Web boilerplates
                </div>
                <p className="mt-1 text-xs text-[#6A6158] dark:text-[#B6ADA3]">
                  Open-source Vite/React starters, auto-adapted to Indobase on import.
                </p>
                {renderTemplateButtons(PRECHAT_WEB_BOILERPLATES)}
              </div>

              <div className="mt-6 border-t border-black/8 pt-5 dark:border-white/8">
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#A09890] dark:text-[#8E857B]">
                  Mobile boilerplates
                </div>
                <p className="mt-1 text-xs text-[#6A6158] dark:text-[#B6ADA3]">
                  Expo apps for Android bundles and native auth flows.
                </p>
                {renderTemplateButtons(PRECHAT_MOBILE_BOILERPLATES)}
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
