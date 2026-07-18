import { memo, Fragment } from 'react';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import Popover from '~/components/ui/Popover';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import WithTooltip from '~/components/ui/Tooltip';
import type { Message } from 'ai';
import type { ProviderInfo } from '~/types/model';
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';
import { ToolInvocations } from './ToolInvocations';
import type { ToolCallAnnotation } from '~/types/context';

interface AssistantMessageProps {
  content: string;
  annotations?: JSONValue[];
  messageId?: string;
  onRewind?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

function openArtifactInWorkbench(filePath: string) {
  filePath = normalizedFilePath(filePath);

  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

function normalizedFilePath(path: string) {
  let normalizedPath = path;

  if (normalizedPath.startsWith(WORK_DIR)) {
    normalizedPath = path.replace(WORK_DIR, '');
  }

  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }

  return normalizedPath;
}

export const AssistantMessage = memo(
  ({
    content,
    annotations,
    messageId,
    onRewind,
    onFork,
    append,
    chatMode,
    setChatMode,
    model,
    provider,
    parts,
    addToolResult,
  }: AssistantMessageProps) => {
    const filteredAnnotations = (annotations?.filter(
      (annotation: JSONValue) =>
        annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
    ) || []) as { type: string; value: any } & { [key: string]: any }[];

    let chatSummary: string | undefined = undefined;

    if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
      chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
    }

    let codeContext: string[] | undefined = undefined;

    if (filteredAnnotations.find((annotation) => annotation.type === 'codeContext')) {
      codeContext = filteredAnnotations.find((annotation) => annotation.type === 'codeContext')?.files;
    }

    /*
     * Build steps from the planner, shown as a checklist so the user can see the shape of the
     * build before/while it happens rather than watching an opaque "coder" phase.
     */
    const planSteps: string[] | undefined = filteredAnnotations.find(
      (annotation) => annotation.type === 'agentPlan',
    )?.steps;

    const usage: {
      completionTokens: number;
      promptTokens: number;
      totalTokens: number;
    } = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value;

    const toolInvocations = parts?.filter((part) => part.type === 'tool-invocation');
    const toolCallAnnotations = filteredAnnotations.filter(
      (annotation) => annotation.type === 'toolCall',
    ) as ToolCallAnnotation[];

    const hasActions = Boolean((onRewind || onFork) && messageId);

    return (
      <div className="flex w-full gap-3">
        {/* Assistant avatar — gives each turn a clear visual anchor */}
        <div className="mt-0.5 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
            <img src="/logo.svg" alt="Indobase" className="h-4 w-4" />
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Indobase</span>
            {(codeContext || chatSummary) && (
              <Popover
                side="right"
                align="start"
                trigger={
                  <div className="i-ph:info cursor-pointer text-bolt-elements-textTertiary transition-colors hover:text-bolt-elements-textSecondary" />
                }
              >
                {chatSummary && (
                  <div className="max-w-chat">
                    <div className="summary max-h-96 flex flex-col">
                      <h2 className="border border-bolt-elements-borderColor rounded-md p4">Summary</h2>
                      <div style={{ zoom: 0.7 }} className="overflow-y-auto m4">
                        <Markdown>{chatSummary}</Markdown>
                      </div>
                    </div>
                    {codeContext && (
                      <div className="code-context flex flex-col p4 border border-bolt-elements-borderColor rounded-md">
                        <h2>Context</h2>
                        <div className="flex gap-4 mt-4 bolt" style={{ zoom: 0.6 }}>
                          {codeContext.map((x) => {
                            const normalized = normalizedFilePath(x);
                            return (
                              <Fragment key={normalized}>
                                <code
                                  className="cursor-pointer rounded-md bg-gray-100 px-1.5 py-1 text-gray-800 hover:text-gray-950 hover:underline"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openArtifactInWorkbench(normalized);
                                  }}
                                >
                                  {normalized}
                                </code>
                              </Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="context"></div>
              </Popover>
            )}
          </div>

          {planSteps && planSteps.length > 0 && (
            <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <span className="i-ph:list-checks text-sm" />
                Build plan
              </div>
              <ol className="flex flex-col gap-1.5">
                {planSteps.map((step, index) => (
                  <li key={step} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <Markdown append={append} chatMode={chatMode} setChatMode={setChatMode} model={model} provider={provider} html>
            {content}
          </Markdown>

          {toolInvocations && toolInvocations.length > 0 && (
            <ToolInvocations
              toolInvocations={toolInvocations}
              toolCallAnnotations={toolCallAnnotations}
              addToolResult={addToolResult}
            />
          )}

          {(usage || hasActions) && (
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
              {usage && (
                <span title={`prompt ${usage.promptTokens} · completion ${usage.completionTokens}`}>
                  {usage.totalTokens.toLocaleString()} tokens
                </span>
              )}
              {hasActions && (
                <div className="flex items-center gap-2">
                  {onRewind && (
                    <WithTooltip tooltip="Revert to this message">
                      <button
                        onClick={() => onRewind(messageId!)}
                        className="i-ph:arrow-u-up-left text-sm transition-colors hover:text-gray-900"
                      />
                    </WithTooltip>
                  )}
                  {onFork && (
                    <WithTooltip tooltip="Fork chat from this message">
                      <button
                        onClick={() => onFork(messageId!)}
                        className="i-ph:git-fork text-sm transition-colors hover:text-gray-900"
                      />
                    </WithTooltip>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);
