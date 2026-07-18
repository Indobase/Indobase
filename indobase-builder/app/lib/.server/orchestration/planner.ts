import { generateText, type CoreTool, type GenerateTextResult, type Message } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { resolveOpenRouterModelForTask } from '~/lib/indobase/openrouter-model-policy';
import { extractPropertiesFromMessage, simplifyBoltActions } from '~/lib/.server/llm/utils';
import { createScopedLogger } from '~/utils/logger';
import { LLMManager } from '~/lib/modules/llm/manager';
import { PLANNER_SYSTEM_PROMPT, SCOPING_SYSTEM_PROMPT } from './prompts';

const logger = createScopedLogger('planner-agent');

export async function runPlannerAgent(props: {
  messages: Message[];
  env?: Env;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  onFinish?: (resp: GenerateTextResult<Record<string, CoreTool<any, any>>, never>) => void;
  /** Override for the scoping pass; defaults to the implementation-plan prompt. */
  systemPrompt?: string;
  prompt?: string;
}) {
  const { messages, env: serverEnv, apiKeys, providerSettings, onFinish } = props;
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;

  const processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;
      return { ...message, content };
    }

    if (message.role === 'assistant') {
      let content = message.content;
      content = simplifyBoltActions(content);
      content = content.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
      content = content.replace(/<think>.*?<\/think>/s, '');
      return { ...message, content };
    }

    return message;
  });

  ({ providerName: currentProvider, modelName: currentModel } = resolveOpenRouterModelForTask(
    'planning',
    currentProvider,
    currentModel,
  ));

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel) ?? modelsList[0];
    logger.warn(`Planner using model ${modelDetails.name}`);
  }

  const extractTextContent = (message: Message) =>
    Array.isArray(message.content)
      ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
      : message.content;

  const conversation = processedMessages
    .map((message) => `---\n[${message.role}] ${extractTextContent(message)}\n---`)
    .join('\n');

  const resp = await generateText({
    system: props.systemPrompt ?? PLANNER_SYSTEM_PROMPT,
    prompt:
      props.prompt ??
      `Review the conversation and produce an implementation plan for the latest user request.

${conversation}

Provide the plan now.`,
    maxTokens: 4096,
    model: provider.getModelInstance({
      model: currentModel,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
  });

  if (onFinish) {
    onFinish(resp);
  }

  return resp.text.trim();
}

export type ClarifyingQuestion = {
  question: string;
  why?: string;
  suggestions?: string[];
};

/**
 * Tolerant JSON extraction — small models wrap JSON in prose or ```json fences.
 * Pure, so it can be unit tested without a model.
 */
export function parseScopingResponse(raw: string): { needsClarification: boolean; questions: ClarifyingQuestion[] } {
  const empty = { needsClarification: false, questions: [] as ClarifyingQuestion[] };

  if (!raw?.trim()) {
    return empty;
  }

  const fenced = raw.replace(/```(?:json)?/gi, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');

  if (start === -1 || end <= start) {
    return empty;
  }

  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1)) as {
      needsClarification?: boolean;
      questions?: unknown;
    };

    if (!parsed?.needsClarification || !Array.isArray(parsed.questions)) {
      return empty;
    }

    const questions = parsed.questions
      .map((item) => {
        const q = item as ClarifyingQuestion;
        return {
          question: String(q?.question ?? '').trim(),
          why: q?.why ? String(q.why).trim() : undefined,
          suggestions: Array.isArray(q?.suggestions) ? q.suggestions.map((s) => String(s)).slice(0, 4) : undefined,
        };
      })
      .filter((q) => q.question.length > 0)
      .slice(0, 3);

    // No usable questions => don't stall the build.
    return questions.length ? { needsClarification: true, questions } : empty;
  } catch {
    return empty;
  }
}

/** Scoping pass: ask up to 3 questions when the request is too vague to build in one go. */
export async function runScopingAgent(props: {
  messages: Message[];
  env?: Env;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
}): Promise<{ needsClarification: boolean; questions: ClarifyingQuestion[] }> {
  const raw = await runPlannerAgent({
    ...props,
    systemPrompt: SCOPING_SYSTEM_PROMPT,
    prompt: undefined,
  });

  return parseScopingResponse(raw);
}
