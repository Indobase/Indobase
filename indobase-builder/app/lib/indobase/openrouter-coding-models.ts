/**
 * Curated OpenRouter models for discuss/planning and codegen fallback.
 *
 * These are deliberately CHEAP PAID models, not `:free` ones. Free-tier OpenRouter models are
 * rate-limited independently of account credits, which repeatedly killed the planner and aborted
 * codegen streams mid-build. Paying fractions of a cent per call removes that failure mode.
 * Prices below are USD per 1M tokens (in/out) at the time of selection.
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
    // $0.07 / $0.27 — coder-tuned, first fallback for codegen.
    label: 'Qwen3 Coder 30B',
    name: 'qwen/qwen3-coder-30b-a3b-instruct',
    originalName: 'qwen/qwen3-coder-30b-a3b-instruct',
    maxTokenAllowed: 160000,
    maxCompletionTokens: 32768,
    tier: 'Paid',
  },
  {
    // $0.065 / $0.26 — 1M context, fast, good general instruction following.
    label: 'Qwen3.5 Flash',
    name: 'qwen/qwen3.5-flash-02-23',
    originalName: 'qwen/qwen3.5-flash-02-23',
    maxTokenAllowed: 1000000,
    maxCompletionTokens: 65536,
    tier: 'Paid',
  },
  {
    // $0.037 / $0.17 — cheapest capable large MoE; used for planning/scoping.
    label: 'GPT-OSS 120B',
    name: 'openai/gpt-oss-120b',
    originalName: 'openai/gpt-oss-120b',
    maxTokenAllowed: 131072,
    maxCompletionTokens: 131072,
    tier: 'Paid',
  },
  {
    // $0.05 / $0.20 — very large output budget.
    label: 'Nemotron 3 Nano 30B',
    name: 'nvidia/nemotron-3-nano-30b-a3b',
    originalName: 'nvidia/nemotron-3-nano-30b-a3b',
    maxTokenAllowed: 262144,
    maxCompletionTokens: 228000,
    tier: 'Paid',
  },
  {
    // $0.10 / $0.15 — cheap output, also vision-capable.
    label: 'Qwen3.5 9B',
    name: 'qwen/qwen3.5-9b',
    originalName: 'qwen/qwen3.5-9b',
    maxTokenAllowed: 262144,
    maxCompletionTokens: 262144,
    tier: 'Paid',
  },
] as const satisfies readonly CuratedCodingModel[];

export const OPENROUTER_FREE_VISION_MODEL = {
  // $0.10 / $0.15 — accepts image input; same model as the 9B entry above.
  label: 'Qwen3.5 9B (Vision)',
  name: 'qwen/qwen3.5-9b',
  originalName: 'qwen/qwen3.5-9b',
  maxTokenAllowed: 262144,
  maxCompletionTokens: 262144,
  tier: 'Paid',
} as const satisfies CuratedCodingModel;

/** Default chat model — cheap, fast, large context. */
/** Referenced by name, not index — reordering the list must not silently change the default model. */
export const DEFAULT_OPENROUTER_CODING_MODEL =
  OPENROUTER_FREE_CODING_MODELS.find((model) => model.name === 'qwen/qwen3.5-flash-02-23')?.name ??
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
