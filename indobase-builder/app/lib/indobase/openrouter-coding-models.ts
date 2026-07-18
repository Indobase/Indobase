/**
 * Curated OpenRouter free models for discuss/planning (codegen uses paid DeepSeek server-side).
 */
export type CuratedCodingModel = {
  label: string;
  name: string;
  originalName: string;
  /** Context window. */
  maxTokenAllowed: number;
  /** Output budget for one generation. Omitted => provider default (OpenRouter: 8192). */
  maxCompletionTokens?: number;
  tier: 'Free' | 'Paid';
};

export const OPENROUTER_FREE_CODING_MODELS = [
  {
    label: 'Qwen3 Coder (Free)',
    name: 'qwen/qwen3-coder:free',
    originalName: 'qwen/qwen3-coder:free',
    maxTokenAllowed: 1048576,
    maxCompletionTokens: 262000,
    tier: 'Free',
  },
  {
    label: 'Cohere North Mini Code (Free)',
    name: 'cohere/north-mini-code:free',
    originalName: 'cohere/north-mini-code:free',
    maxTokenAllowed: 256000,
    maxCompletionTokens: 64000,
    tier: 'Free',
  },
  {
    label: 'Poolside Laguna M (Free)',
    name: 'poolside/laguna-m.1:free',
    originalName: 'poolside/laguna-m.1:free',
    maxTokenAllowed: 262144,
    maxCompletionTokens: 32768,
    tier: 'Free',
  },
  {
    label: 'GPT-OSS 20B (Free)',
    name: 'openai/gpt-oss-20b:free',
    originalName: 'openai/gpt-oss-20b:free',
    maxTokenAllowed: 131072,
    maxCompletionTokens: 32768,
    tier: 'Free',
  },
  {
    label: 'Qwen3 Next 80B (Free)',
    name: 'qwen/qwen3-next-80b-a3b-instruct:free',
    originalName: 'qwen/qwen3-next-80b-a3b-instruct:free',
    maxTokenAllowed: 262144,
    maxCompletionTokens: 32768,
    tier: 'Free',
  },
  {
    label: 'Llama 3.3 70B (Free)',
    name: 'meta-llama/llama-3.3-70b-instruct:free',
    originalName: 'meta-llama/llama-3.3-70b-instruct:free',
    maxTokenAllowed: 131072,
    maxCompletionTokens: 32768,
    tier: 'Free',
  },
  {
    label: 'Nemotron 3 Super (Free)',
    name: 'nvidia/nemotron-3-super-120b-a12b:free',
    originalName: 'nvidia/nemotron-3-super-120b-a12b:free',
    maxTokenAllowed: 1000000,
    maxCompletionTokens: 262144,
    tier: 'Free',
  },
  {
    label: 'Nemotron Nano 9B (Free)',
    name: 'nvidia/nemotron-nano-9b-v2:free',
    originalName: 'nvidia/nemotron-nano-9b-v2:free',
    maxTokenAllowed: 128000,
    maxCompletionTokens: 32768,
    tier: 'Free',
  },
] as const satisfies readonly CuratedCodingModel[];

export const OPENROUTER_FREE_VISION_MODEL = {
  label: 'Nemotron Nano VL (Free)',
  name: 'nvidia/nemotron-nano-12b-v2-vl:free',
  originalName: 'nvidia/nemotron-nano-12b-v2-vl:free',
  maxTokenAllowed: 128000,
  maxCompletionTokens: 32768,
  tier: 'Free',
} as const satisfies CuratedCodingModel;

/** Default chat model — prefer a stable free coding model with lower 429 pressure than Qwen3 Coder. */
/** Referenced by name, not index — reordering the list must not silently change the default model. */
export const DEFAULT_OPENROUTER_CODING_MODEL =
  OPENROUTER_FREE_CODING_MODELS.find((model) => model.name === 'cohere/north-mini-code:free')?.name ??
  OPENROUTER_FREE_CODING_MODELS[0].name;

export const OPENROUTER_ALLOWED_FREE_MODEL_IDS = [
  ...OPENROUTER_FREE_CODING_MODELS.map((model) => model.name),
  OPENROUTER_FREE_VISION_MODEL.name,
] as const;

export function isAllowedOpenRouterFreeModelId(modelId: string): boolean {
  return (OPENROUTER_ALLOWED_FREE_MODEL_IDS as readonly string[]).includes(modelId);
}

export function toOpenRouterModelInfo(
  model: CuratedCodingModel,
  provider = 'OpenRouter',
): { name: string; label: string; provider: string; maxTokenAllowed: number; maxCompletionTokens?: number } {
  return {
    name: model.name,
    label: model.label,
    provider,
    maxTokenAllowed: model.maxTokenAllowed,

    /*
     * Must be forwarded: getCompletionTokenLimit() falls back to the provider default
     * (OpenRouter: 8192) when this is absent, truncating multi-file app generations mid-file.
     */
    ...(model.maxCompletionTokens ? { maxCompletionTokens: model.maxCompletionTokens } : {}),
  };
}
