import type { Message } from 'ai';
import type { ProgressAnnotation } from '~/types/context';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import { runPlannerAgent, runScopingAgent, type ClarifyingQuestion } from './planner';

type DataStreamWriter = {
  writeData: (data: ProgressAnnotation | Record<string, unknown>) => void;
  writeMessageAnnotation: (annotation: Record<string, unknown>) => void;
};

/**
 * Pull the "## Build steps" list out of the plan so the UI can show it as a checklist and tie
 * progress to real milestones instead of a generic "coder" phase. Pure — unit testable.
 */
export function extractPlanSteps(plan: string): string[] {
  if (!plan?.trim()) {
    return [];
  }

  const lines = plan.split('\n');
  const startIndex = lines.findIndex((line) => /^#{1,4}\s*build steps/i.test(line.trim()));
  const scan = startIndex === -1 ? lines : lines.slice(startIndex + 1);
  const steps: string[] = [];

  for (const line of scan) {
    const trimmed = line.trim();

    // Stop at the next heading once we've started collecting.
    if (steps.length && /^#{1,4}\s/.test(trimmed)) {
      break;
    }

    const match = trimmed.match(/^(?:\d+[.)]|[-*])\s+(.*)$/);

    if (match) {
      const text = match[1].replace(/\*\*/g, '').trim();

      if (text) {
        steps.push(text);
      }
    }
  }

  return steps.slice(0, 7);
}

/**
 * Turn this round into a question round instead of a build round. Reuses the normal streaming path
 * (rather than aborting mid-stream) so the user gets a natural assistant turn asking the questions.
 */
export function injectClarifyingQuestions(messages: Message[], questions: ClarifyingQuestion[]): Message[] {
  if (!questions.length) {
    return messages;
  }

  const lastUserIndex = [...messages].reverse().findIndex((message) => message.role === 'user');

  if (lastUserIndex === -1) {
    return messages;
  }

  const index = messages.length - 1 - lastUserIndex;
  const lastUser = messages[index];
  const { model, provider, content } = extractPropertiesFromMessage(lastUser);

  const rendered = questions
    .map((q, i) => {
      const suggestions = q.suggestions?.length ? `\n   Options: ${q.suggestions.join(' · ')}` : '';
      const why = q.why ? `\n   (${q.why})` : '';
      return `${i + 1}. ${q.question}${suggestions}${why}`;
    })
    .join('\n');

  const updatedContent = `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${content}

<clarifying_questions>
${rendered}
</clarifying_questions>

Do NOT write any code, files, or bolt artifacts this turn. Briefly restate what you understood (one sentence), then ask ONLY the questions above, formatted as a short numbered list with the suggested options. Tell the user you will build as soon as they answer.`;

  const updated = [...messages];
  updated[index] = { ...lastUser, content: updatedContent };

  return updated;
}

export function injectPlannerPlan(messages: Message[], plan: string): Message[] {
  if (!plan.trim()) {
    return messages;
  }

  const lastUserIndex = [...messages].reverse().findIndex((message) => message.role === 'user');

  if (lastUserIndex === -1) {
    return messages;
  }

  const index = messages.length - 1 - lastUserIndex;
  const lastUser = messages[index];
  const { model, provider, content } = extractPropertiesFromMessage(lastUser);

  const updatedContent = `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${content}

<agent_plan>
${plan}
</agent_plan>

Execute this plan as the Coder agent using bolt artifacts.`;

  const updated = [...messages];
  updated[index] = { ...lastUser, content: updatedContent };
  return updated;
}

/**
 * Scoping pass. Vague one-line requests are the main cause of failed builds — the coder tries to
 * one-shot an unbounded app and runs out of output budget. Asking up to 3 questions first narrows
 * scope so the build can actually finish.
 *
 * Fails OPEN: any error, or no usable questions, proceeds straight to planning. Never blocks a build.
 */
export async function runScopingPhase(props: {
  messages: Message[];
  dataStream: DataStreamWriter;
  progressOrder: { value: number };
  env?: Env;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, unknown>;
}): Promise<{ needsClarification: boolean; questions: ClarifyingQuestion[] }> {
  const { messages, dataStream, progressOrder, env, apiKeys, providerSettings } = props;

  dataStream.writeData({
    type: 'progress',
    label: 'scoping',
    status: 'in-progress',
    order: progressOrder.value++,
    message: 'Checking the request is specific enough to build',
  } satisfies ProgressAnnotation);

  let result: { needsClarification: boolean; questions: ClarifyingQuestion[] } = {
    needsClarification: false,
    questions: [],
  };

  try {
    result = await runScopingAgent({
      messages,
      env,
      apiKeys,
      providerSettings: providerSettings as any,
    });
  } catch (error) {
    console.warn('[scoping-agent] Scoping failed; continuing to planner', error);
  }

  if (!result.needsClarification) {
    dataStream.writeData({
      type: 'progress',
      label: 'scoping',
      status: 'complete',
      order: progressOrder.value++,
      message: 'Request is clear — planning the build',
    } satisfies ProgressAnnotation);

    return result;
  }

  dataStream.writeData({
    type: 'progress',
    label: 'scoping',
    status: 'complete',
    order: progressOrder.value++,
    message: 'A few details needed before building',
  } satisfies ProgressAnnotation);

  dataStream.writeMessageAnnotation({
    type: 'clarifyingQuestions',
    agent: 'planner',
    questions: result.questions,
  });

  return result;
}

export async function runPlannerPhase(props: {
  messages: Message[];
  dataStream: DataStreamWriter;
  progressOrder: { value: number };
  env?: Env;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, unknown>;
  onUsage?: (usage: { completionTokens?: number; promptTokens?: number; totalTokens?: number }) => void;
}): Promise<{ plan: string; messages: Message[] }> {
  const { messages, dataStream, progressOrder, env, apiKeys, providerSettings, onUsage } = props;

  dataStream.writeData({
    type: 'progress',
    label: 'planner',
    status: 'in-progress',
    order: progressOrder.value++,
    message: 'Planner agent analyzing request',
  } satisfies ProgressAnnotation);

  let plan = '';

  try {
    plan = await runPlannerAgent({
      messages,
      env,
      apiKeys,
      providerSettings: providerSettings as any,
      onFinish(resp) {
        if (resp.usage && onUsage) {
          onUsage(resp.usage);
        }
      },
    });
  } catch (error) {
    // Never block codegen on planner/network failures (e.g. OpenRouter DNS flake).
    console.warn('[planner-agent] Planner failed; continuing without plan', error);

    dataStream.writeData({
      type: 'progress',
      label: 'planner',
      status: 'complete',
      order: progressOrder.value++,
      message: 'Planner unavailable — continuing with coder',
    } satisfies ProgressAnnotation);

    dataStream.writeData({
      type: 'progress',
      label: 'coder',
      status: 'in-progress',
      order: progressOrder.value++,
      message: 'Coder agent generating implementation',
    } satisfies ProgressAnnotation);

    return { plan: '', messages };
  }

  dataStream.writeData({
    type: 'progress',
    label: 'planner',
    status: 'complete',
    order: progressOrder.value++,
    message: 'Implementation plan ready',
  } satisfies ProgressAnnotation);

  const steps = extractPlanSteps(plan);

  dataStream.writeMessageAnnotation({
    type: 'agentPlan',
    agent: 'planner',
    plan,
    // Rendered as a checklist; ticked off as the build progresses.
    steps,
  });

  dataStream.writeData({
    type: 'progress',
    label: 'coder',
    status: 'in-progress',
    order: progressOrder.value++,
    // Name the actual milestone rather than a generic phase.
    message: steps.length ? `Building: ${steps[0]}` : 'Coder agent generating implementation',
  } satisfies ProgressAnnotation);

  return {
    plan,
    messages: injectPlannerPlan(messages, plan),
  };
}

export function completeCoderPhase(dataStream: DataStreamWriter, progressOrder: { value: number }) {
  dataStream.writeData({
    type: 'progress',
    label: 'coder',
    status: 'complete',
    order: progressOrder.value++,
    message: 'Implementation generated',
  } satisfies ProgressAnnotation);
}
