import {
  DEFAULT_OPENROUTER_CODING_MODEL,
  OPENROUTER_FREE_CODING_MODELS,
  toOpenRouterModelInfo,
} from '~/lib/indobase/openrouter-coding-models';
import {
  coerceOpenRouterFreeChatTarget,
  isOpenRouterFreeModelId,
  OPENROUTER_PROVIDER_NAME,
} from '~/lib/indobase/openrouter-free-models';

/** Paid OpenRouter model for Builder codegen and autonomous debugging. */
export const OPENROUTER_PAID_CODEGEN_MODEL = 'deepseek/deepseek-v4-pro';

export const OPENROUTER_PAID_CODEGEN_MODEL_META = {
  label: 'DeepSeek V4 Pro',
  name: OPENROUTER_PAID_CODEGEN_MODEL,
  originalName: OPENROUTER_PAID_CODEGEN_MODEL,
  maxTokenAllowed: 128000,
  tier: 'Paid' as const,
};

/** General discuss chat — curated OpenRouter free tier. */
export const DEFAULT_OPENROUTER_CHAT_MODEL = DEFAULT_OPENROUTER_CODING_MODEL;

/** Planner agent — curated OpenRouter free tier. */
export const DEFAULT_OPENROUTER_PLANNING_MODEL =
  OPENROUTER_FREE_CODING_MODELS.find((model) => model.name === 'meta-llama/llama-3.3-70b-instruct:free')?.name ??
  DEFAULT_OPENROUTER_CHAT_MODEL;

export type OpenRouterTask = 'chat' | 'planning' | 'codegen' | 'debugging';

export function isOpenRouterPaidCodegenModelId(modelId: string): boolean {
  return modelId === OPENROUTER_PAID_CODEGEN_MODEL;
}

export function resolveOpenRouterModelForTask(
  task: OpenRouterTask,
  providerName: string,
  modelName: string,
): { providerName: string; modelName: string } {
  if (task === 'codegen' || task === 'debugging') {
    return {
      providerName: OPENROUTER_PROVIDER_NAME,
      modelName: OPENROUTER_PAID_CODEGEN_MODEL,
    };
  }

  if (task === 'planning') {
    const coerced = coerceOpenRouterFreeChatTarget(providerName, modelName);

    return {
      providerName: coerced.providerName,
      modelName: isOpenRouterFreeModelId(coerced.modelName)
        ? DEFAULT_OPENROUTER_PLANNING_MODEL
        : coerced.modelName,
    };
  }

  return coerceOpenRouterFreeChatTarget(providerName, modelName);
}

export function toOpenRouterPaidCodegenModelInfo() {
  return toOpenRouterModelInfo(OPENROUTER_PAID_CODEGEN_MODEL_META);
}
