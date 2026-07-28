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

/** Slow/paid model reserved for autonomous repair when a build already failed. */
export const OPENROUTER_PAID_CODEGEN_MODEL = 'deepseek/deepseek-v4-pro';

export const OPENROUTER_PAID_CODEGEN_MODEL_META = {
  label: 'DeepSeek V4 Pro',
  name: OPENROUTER_PAID_CODEGEN_MODEL,
  originalName: OPENROUTER_PAID_CODEGEN_MODEL,
  maxTokenAllowed: 1048576,
  maxCompletionTokens: 64000,
  tier: 'Paid' as const,
};

/**
 * Default Builder codegen model — optimized for wall-clock speed.
 * DeepSeek Pro is reserved for debugging/repair only.
 */
export const OPENROUTER_FAST_CODEGEN_MODEL =
  OPENROUTER_FREE_CODING_MODELS.find((model) => model.name === 'qwen/qwen3.5-flash-02-23')?.name ??
  OPENROUTER_FREE_CODING_MODELS.find((model) => model.name === 'qwen/qwen3-coder-30b-a3b-instruct')?.name ??
  DEFAULT_OPENROUTER_CODING_MODEL;

/** @deprecated Use OPENROUTER_FAST_CODEGEN_MODEL — kept for existing imports/tests. */
export const OPENROUTER_FAST_SCAFFOLD_MODEL = OPENROUTER_FAST_CODEGEN_MODEL;

/** Completion budget for fast codegen (Flash supports up to 65k). */
export const OPENROUTER_FAST_CODEGEN_MAX_COMPLETION_TOKENS = 49152;

/** @deprecated Use OPENROUTER_FAST_CODEGEN_MAX_COMPLETION_TOKENS */
export const OPENROUTER_FAST_SCAFFOLD_MAX_COMPLETION_TOKENS = OPENROUTER_FAST_CODEGEN_MAX_COMPLETION_TOKENS;

/** General discuss chat — curated OpenRouter free tier. */
export const DEFAULT_OPENROUTER_CHAT_MODEL = DEFAULT_OPENROUTER_CODING_MODEL;

/*
 * Planner/scoping agent. Previously a `:free` model, which is rate-limited independently of
 * account credits — that is why the planner kept reporting "Planner unavailable". A cheap paid
 * model removes the 429 cliff for a fraction of a cent per plan.
 */
export const DEFAULT_OPENROUTER_PLANNING_MODEL =
  OPENROUTER_FREE_CODING_MODELS.find((model) => model.name === 'openai/gpt-oss-120b')?.name ??
  DEFAULT_OPENROUTER_CHAT_MODEL;

export type OpenRouterTask = 'chat' | 'planning' | 'codegen' | 'debugging' | 'scaffold';

export function isOpenRouterPaidCodegenModelId(modelId: string): boolean {
  return modelId === OPENROUTER_PAID_CODEGEN_MODEL;
}

export function isOpenRouterFastCodegenModelId(modelId: string): boolean {
  return modelId === OPENROUTER_FAST_CODEGEN_MODEL;
}

/** @deprecated Use isOpenRouterFastCodegenModelId */
export function isOpenRouterFastScaffoldModelId(modelId: string): boolean {
  return isOpenRouterFastCodegenModelId(modelId);
}

/** Models that must not be clamped to the tiny OpenRouter free-tier completion budget. */
export function isOpenRouterHighBudgetModelId(modelId: string): boolean {
  return isOpenRouterPaidCodegenModelId(modelId) || isOpenRouterFastCodegenModelId(modelId);
}

export function resolveOpenRouterModelForTask(
  task: OpenRouterTask,
  providerName: string,
  modelName: string,
): { providerName: string; modelName: string } {
  // Repair only — keep the strongest model when fixing a broken preview.
  if (task === 'debugging') {
    return {
      providerName: OPENROUTER_PROVIDER_NAME,
      modelName: OPENROUTER_PAID_CODEGEN_MODEL,
    };
  }

  // All Build codegen (simple + complex) uses the fast model for Emergent-like latency.
  if (task === 'codegen' || task === 'scaffold') {
    return {
      providerName: OPENROUTER_PROVIDER_NAME,
      modelName: OPENROUTER_FAST_CODEGEN_MODEL,
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
