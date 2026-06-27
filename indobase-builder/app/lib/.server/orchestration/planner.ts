import { generateText, type CoreTool, type GenerateTextResult, type Message } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { extractPropertiesFromMessage, simplifyBoltActions } from '~/lib/.server/llm/utils';
import { createScopedLogger } from '~/utils/logger';
import { LLMManager } from '~/lib/modules/llm/manager';
import { PLANNER_SYSTEM_PROMPT } from './prompts';

const logger = createScopedLogger('planner-agent');

export async function runPlannerAgent(props: {
  messages: Message[];
  env?: Env;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  onFinish?: (resp: GenerateTextResult<Record<string, CoreTool<any, any>>, never>) => void;
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
    system: PLANNER_SYSTEM_PROMPT,
    prompt: `Review the conversation and produce an implementation plan for the latest user request.

${conversation}

Provide the plan now.`,
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
