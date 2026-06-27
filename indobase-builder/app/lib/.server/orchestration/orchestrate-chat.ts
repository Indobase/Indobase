import type { Message } from 'ai';
import type { ProgressAnnotation } from '~/types/context';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import { runPlannerAgent } from './planner';

type DataStreamWriter = {
  writeData: (data: ProgressAnnotation | Record<string, unknown>) => void;
  writeMessageAnnotation: (annotation: Record<string, unknown>) => void;
};

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

  const plan = await runPlannerAgent({
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

  dataStream.writeData({
    type: 'progress',
    label: 'planner',
    status: 'complete',
    order: progressOrder.value++,
    message: 'Implementation plan ready',
  } satisfies ProgressAnnotation);

  dataStream.writeMessageAnnotation({
    type: 'agentPlan',
    agent: 'planner',
    plan,
  });

  dataStream.writeData({
    type: 'progress',
    label: 'coder',
    status: 'in-progress',
    order: progressOrder.value++,
    message: 'Coder agent generating implementation',
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
