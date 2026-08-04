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
import { sanitizePlanSteps } from '~/lib/indobase/sanitize-plan-text';
import { ClarifyingQuestionsCard, type ClarifyingQuestionView } from './ClarifyingQuestionsCard';

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
    const planSteps: string[] | undefined = (() => {
      const raw = filteredAnnotations.find((annotation) => annotation.type === 'agentPlan')?.steps;

      if (!Array.isArray(raw) || raw.length === 0) {
        return undefined;
      }

      const cleaned = sanitizePlanSteps(raw.map((step) => String(step ?? '')));

      return cleaned.length > 0 ? cleaned : undefined;
    })();

    const clarifyingQuestions: ClarifyingQuestionView[] | undefined = (() => {
      const raw = filteredAnnotations.find((annotation) => annotation.type === 'clarifyingQuestions')?.questions;

      if (!Array.isArray(raw) || raw.length === 0) {
        return undefined;
      }

      return raw
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const q = item as ClarifyingQuestionView;

          if (typeof q.question !== 'string' || !q.question.trim()) {
            return null;
          }

          return {
            question: q.question,
            why: typeof q.why === 'string' ? q.why : undefined,
            suggestions: Array.isArray(q.suggestions)
              ? q.suggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              : undefined,
          };
        })
        .filter((item): item is ClarifyingQuestionView => item !== null);
    })();

    const usageAnnotation = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value as
      | {
          completionTokens?: number;
          promptTokens?: number;
          totalTokens?: number;
        }
      | undefined;
    const usage =
      usageAnnotation && typeof usageAnnotation.totalTokens === 'number'
        ? {
            completionTokens: Number(usageAnnotation.completionTokens) || 0,
            promptTokens: Number(usageAnnotation.promptTokens) || 0,
            totalTokens: usageAnnotation.totalTokens,
          }
        : undefined;

    const toolInvocations = parts?.filter((part) => part.type === 'tool-invocation');
    const toolCallAnnotations = filteredAnnotations.filter(
      (annotation) => annotation.type === 'toolCall',
    ) as ToolCallAnnotation[];

    const hasActions = Boolean((onRewind || onFork) && messageId);

    return (
      <div className="flex w-full gap-3">
        <div className="mt-1 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[#D6E7FF] bg-[#EAF2FF]">
            <img src="/icons/indobase-logo-mark.svg" alt="Indobase" className="h-4 w-4" />
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Indobase</span>
            {(codeContext || chatSummary) && (
              <Popover
                side="right"
                align="start"
                trigger={
                  <div className="i-ph:info cursor-pointer text-gray-400 transition-colors hover:text-gray-600" />
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

          {clarifyingQuestions && clarifyingQuestions.length > 0 && (
            <ClarifyingQuestionsCard
              questions={clarifyingQuestions}
              append={append}
              model={model}
              providerName={provider?.name}
            />
          )}

          {planSteps && planSteps.length > 0 && !clarifyingQuestions?.length && (
            <div className="mb-3 space-y-1.5">
              {planSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex items-center gap-2.5 rounded-xl bg-[#EAF2FF]/px-3 py-2 text-sm text-gray-800"
                >
                  <span className="i-ph:check-circle-fill shrink-0 text-base text-[#2F6FED]" />
                  <span className="min-w-0 flex-1">{step}</span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {index === 0 ? 'Design' : index === planSteps.length - 1 ? 'Preview' : 'Builder'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!(clarifyingQuestions && clarifyingQuestions.length > 0) && content.trim() && (
            <div className="rounded-2xl bg-[#EAF2FF] px-4 py-3 text-gray-900 shadow-sm">
              <Markdown append={append} chatMode={chatMode} setChatMode={setChatMode} model={model} provider={provider} html>
                {content}
              </Markdown>
            </div>
          )}

          {clarifyingQuestions && clarifyingQuestions.length > 0 && content.trim() && (
            <p className="mb-3 rounded-2xl bg-[#EAF2FF] px-4 py-3 text-sm text-gray-800">
              Answer below and I&apos;ll build the full project next — root{' '}
              <code className="rounded bg-white/80 px-1 text-xs">package.json</code> and a live preview
              included.
            </p>
          )}

          {toolInvocations && toolInvocations.length > 0 && (
            <div className="mt-3">
              <ToolInvocations
                toolInvocations={toolInvocations}
                toolCallAnnotations={toolCallAnnotations}
                addToolResult={addToolResult}
              />
            </div>
          )}

          {(usage || hasActions) && (
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
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
                        className="i-ph:arrow-u-up-left text-sm transition-colors hover:text-gray-700"
                      />
                    </WithTooltip>
                  )}
                  {onFork && (
                    <WithTooltip tooltip="Fork chat from this message">
                      <button
                        onClick={() => onFork(messageId!)}
                        className="i-ph:git-fork text-sm transition-colors hover:text-gray-700"
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
