import type { ModelInfo } from '~/lib/modules/llm/types';
import {
  DEFAULT_OPENROUTER_CODING_MODEL,
  isAllowedOpenRouterFreeModelId,
  OPENROUTER_FREE_CODING_MODELS,
  OPENROUTER_FREE_VISION_MODEL,
  toOpenRouterModelInfo,
} from '~/lib/indobase/openrouter-coding-models';

export const OPENROUTER_PROVIDER_NAME = 'OpenRouter';

/** Only curated OpenRouter free coding (+ vision) models are permitted. */
export function isOpenRouterFreeModelId(modelId: string): boolean {
  return isAllowedOpenRouterFreeModelId(modelId);
}

export function filterOpenRouterFreeModels(models: ModelInfo[]): ModelInfo[] {
  return models.filter(
    (model) => model.provider === OPENROUTER_PROVIDER_NAME && isOpenRouterFreeModelId(model.name),
  );
}

export function coerceOpenRouterFreeChatTarget(
  providerName: string,
  modelName: string,
): { providerName: string; modelName: string } {
  const modelNameCoerced = isOpenRouterFreeModelId(modelName) ? modelName : DEFAULT_OPENROUTER_CODING_MODEL;

  return {
    providerName: OPENROUTER_PROVIDER_NAME,
    modelName: modelNameCoerced,
  };
}

interface OpenRouterPricing {
  prompt: number;
  completion: number;
}

interface OpenRouterApiModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: OpenRouterPricing;
}

/** Resolve curated coding models, optionally enriching context windows from the live API. */
export function resolveCuratedOpenRouterFreeModels(apiModels: OpenRouterApiModel[] = []): ModelInfo[] {
  const byId = new Map(apiModels.map((model) => [model.id, model]));
  const maxAllowed = 1_000_000;

  const codingModels = OPENROUTER_FREE_CODING_MODELS.map((curated) => {
    const live = byId.get(curated.name);
    const contextWindow = live?.context_length ?? curated.maxTokenAllowed;

    return toOpenRouterModelInfo({
      ...curated,
      maxTokenAllowed: Math.min(contextWindow, maxAllowed),
    });
  });

  const visionLive = byId.get(OPENROUTER_FREE_VISION_MODEL.name);
  const visionContext = visionLive?.context_length ?? OPENROUTER_FREE_VISION_MODEL.maxTokenAllowed;

  return [
    ...codingModels,
    toOpenRouterModelInfo({
      ...OPENROUTER_FREE_VISION_MODEL,
      maxTokenAllowed: Math.min(visionContext, maxAllowed),
    }),
  ];
}

/** True when the model is on our curated free coding allowlist. */
export function isOpenRouterApiFreeModel(model: { id: string; pricing?: OpenRouterPricing }): boolean {
  return isOpenRouterFreeModelId(model.id);
}
