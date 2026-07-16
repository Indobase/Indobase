import React from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { classNames } from '~/utils/classNames';
import FilePreview from './FilePreview';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { SendButton } from './SendButton.client';
import { IconButton } from '~/components/ui/IconButton';
import { toast } from 'react-toastify';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import { ExpoQrModal } from '~/components/workbench/ExpoQrModal';
import { ColorSchemeDialog } from '~/components/ui/ColorSchemeDialog';
import type { DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { McpTools } from './MCPTools';
import { WebSearch } from './WebSearch.client';

interface ChatBoxProps {
  uploadedFiles: File[];
  imageDataList: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement> | undefined;
  input: string;
  lastUserMessage?: string;
  handlePaste: (e: React.ClipboardEvent) => void;
  TEXTAREA_MIN_HEIGHT: number;
  TEXTAREA_MAX_HEIGHT: number;
  isStreaming: boolean;
  handleSendMessage: (event: React.UIEvent, messageInput?: string) => void;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  chatStarted: boolean;
  exportChat?: () => void;
  qrModalOpen: boolean;
  setQrModalOpen: (open: boolean) => void;
  handleFileUpload: () => void;
  setUploadedFiles?: ((files: File[]) => void) | undefined;
  setImageDataList?: ((dataList: string[]) => void) | undefined;
  handleInputChange?: ((event: React.ChangeEvent<HTMLTextAreaElement>) => void) | undefined;
  handleStop?: (() => void) | undefined;
  enhancingPrompt?: boolean | undefined;
  enhancePrompt?: (() => void) | undefined;
  onWebSearchResult?: (result: string) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: ((element: ElementInfo | null) => void) | undefined;
  /** Hide outer chrome when nested inside a landing prompt card */
  embedded?: boolean;
  agentStatus?: string;
}

export const ChatBox: React.FC<ChatBoxProps> = (props) => {
  const agentStatus =
    props.agentStatus ??
    (props.isStreaming ? 'Agent is working…' : props.chatStarted ? 'Agent is waiting…' : undefined);

  const shell = (
    <>
      <FilePreview
        files={props.uploadedFiles}
        imageDataList={props.imageDataList}
        onRemove={(index) => {
          props.setUploadedFiles?.(props.uploadedFiles.filter((_, i) => i !== index));
          props.setImageDataList?.(props.imageDataList.filter((_, i) => i !== index));
        }}
      />
      <ClientOnly>
        {() => (
          <ScreenshotStateManager
            setUploadedFiles={props.setUploadedFiles}
            setImageDataList={props.setImageDataList}
            uploadedFiles={props.uploadedFiles}
            imageDataList={props.imageDataList}
          />
        )}
      </ClientOnly>
      {props.selectedElement && (
        <div className="mx-1.5 flex items-center justify-between gap-2 rounded-lg rounded-b-none border border-b-0 border-gray-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-gray-800">
          <div className="flex items-center gap-2 lowercase">
            <code className="mr-0.5 rounded bg-accent-500 px-1.5 py-1 text-white">
              {props?.selectedElement?.tagName}
            </code>
            selected for inspection
          </div>
          <button
            className="bg-transparent text-sky-700 pointer-auto"
            onClick={() => props.setSelectedElement?.(null)}
          >
            Clear
          </button>
        </div>
      )}
      {props.chatStarted && agentStatus && (
        /* Flush with the composer below (which drops its top radius) so they read as one control. */
        <div className="flex items-center gap-2 rounded-t-xl border border-b-0 border-gray-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800">
          <span
            className={classNames(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              props.isStreaming ? 'animate-pulse bg-sky-500' : 'bg-sky-300',
            )}
            aria-hidden
          />
          {agentStatus}
        </div>
      )}
      <div
        className={classNames(
          'relative rounded-xl border border-gray-200 bg-gray-50/80',
          props.chatStarted && agentStatus ? 'rounded-t-none' : '',
        )}
      >
        <textarea
          ref={props.textareaRef}
          className={classNames(
            'w-full resize-none bg-transparent pl-4 pr-16 pt-4 text-sm text-gray-900 outline-none placeholder:text-gray-400',
            'transition-all duration-200',
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '2px solid #1488fc';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '2px solid #1488fc';
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';

            const files = Array.from(e.dataTransfer.files);
            files.forEach((file) => {
              if (file.type.startsWith('image/')) {
                const reader = new FileReader();

                reader.onload = (e) => {
                  const base64Image = e.target?.result as string;
                  props.setUploadedFiles?.([...props.uploadedFiles, file]);
                  props.setImageDataList?.([...props.imageDataList, base64Image]);
                };
                reader.readAsDataURL(file);
              }
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              if (event.shiftKey) {
                return;
              }

              event.preventDefault();

              if (props.isStreaming) {
                props.handleStop?.();
                return;
              }

              if (event.nativeEvent.isComposing) {
                return;
              }

              props.handleSendMessage?.(event);
            }

            if (event.key === 'ArrowUp' && !props.input && props.lastUserMessage && !props.isStreaming) {
              event.preventDefault();
              props.handleInputChange?.({
                target: { value: props.lastUserMessage },
              } as React.ChangeEvent<HTMLTextAreaElement>);
            }
          }}
          value={props.input}
          onChange={(event) => {
            props.handleInputChange?.(event);
          }}
          onPaste={props.handlePaste}
          style={{
            minHeight: props.TEXTAREA_MIN_HEIGHT,
            maxHeight: props.TEXTAREA_MAX_HEIGHT,
          }}
          placeholder={
            props.chatStarted
              ? props.chatMode === 'build'
                ? 'Describe what you want to build with Indobase...'
                : 'What would you like to discuss?'
              : 'Describe your idea — we will bring it to life...'
          }
          translate="no"
        />
        <ClientOnly>
          {() => (
            <SendButton
              show={props.input.length > 0 || props.isStreaming || props.uploadedFiles.length > 0}
              isStreaming={props.isStreaming}
              onClick={(event) => {
                if (props.isStreaming) {
                  props.handleStop?.();
                  return;
                }

                if (props.input.length > 0 || props.uploadedFiles.length > 0) {
                  props.handleSendMessage?.(event);
                }
              }}
            />
          )}
        </ClientOnly>
        <div className="flex flex-col gap-2 p-3 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <IconButton
              title="Upload file"
              className="shrink-0 text-gray-500 transition-all hover:text-gray-800"
              onClick={() => props.handleFileUpload()}
            >
              <div className="i-ph:plus-circle text-xl"></div>
            </IconButton>
            <SpeechRecognitionButton
              isListening={props.isListening}
              onStart={props.startListening}
              onStop={props.stopListening}
              disabled={props.isStreaming}
            />
            {props.chatStarted && (
              <>
                <ColorSchemeDialog designScheme={props.designScheme} setDesignScheme={props.setDesignScheme} />
                <McpTools />
                <WebSearch
                  onSearchResult={(result) => props.onWebSearchResult?.(result)}
                  disabled={props.isStreaming}
                />
                <IconButton
                  title="Enhance prompt"
                  disabled={props.input.length === 0 || props.enhancingPrompt}
                  className={classNames('shrink-0 transition-all', props.enhancingPrompt ? 'opacity-100' : '')}
                  onClick={() => {
                    props.enhancePrompt?.();
                    toast.success('Prompt enhanced!');
                  }}
                >
                  {props.enhancingPrompt ? (
                    <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
                  ) : (
                    <div className="i-bolt:stars text-xl"></div>
                  )}
                </IconButton>
                <IconButton
                  title={props.chatMode === 'discuss' ? 'Switch to Build mode' : 'Switch to Discuss mode'}
                  aria-label={props.chatMode === 'discuss' ? 'Discuss mode active' : 'Build mode active'}
                  className={classNames(
                    'shrink-0 transition-all',
                    props.chatMode === 'discuss'
                      ? '!bg-sky-100 !text-sky-800 border border-sky-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-200',
                  )}
                  onClick={() => {
                    props.setChatMode?.(props.chatMode === 'discuss' ? 'build' : 'discuss');
                  }}
                >
                  <div className="i-ph:chats text-xl" />
                </IconButton>
              </>
            )}
          </div>
          {props.input.length > 3 ? (
            <div className="text-xs text-gray-400">
              Use <kbd className="kdb rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">Shift</kbd> +{' '}
              <kbd className="kdb rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">Return</kbd> for a new line
            </div>
          ) : null}
        </div>
      </div>
      <ExpoQrModal open={props.qrModalOpen} onClose={() => props.setQrModalOpen(false)} />
    </>
  );

  if (props.embedded) {
    return <div className="relative z-prompt w-full overflow-visible">{shell}</div>;
  }

  return (
    <div
      className={classNames(
        'relative z-prompt mx-auto w-full max-w-chat overflow-visible rounded-2xl border border-gray-200/80 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.08)]',
      )}
    >
      {shell}
    </div>
  );
};
