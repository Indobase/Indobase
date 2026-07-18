import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENROUTER_CODING_MODEL } from './openrouter-coding-models';
import {
  coerceOpenRouterFreeChatTarget,
  filterOpenRouterFreeModels,
  isOpenRouterApiFreeModel,
  isOpenRouterFreeModelId,
  resolveCuratedOpenRouterFreeModels,
} from './openrouter-free-models';

describe('openrouter-free-models', () => {
  it('accepts only curated coding model ids', () => {
    expect(isOpenRouterFreeModelId('qwen/qwen3-coder-30b-a3b-instruct')).toBe(true);
    expect(isOpenRouterFreeModelId('openai/gpt-oss-120b')).toBe(true);
    expect(isOpenRouterFreeModelId('qwen/qwen3.5-flash-02-23')).toBe(true);
    // Retired free-tier ids must no longer be accepted.
    expect(isOpenRouterFreeModelId('qwen/qwen3-coder:free')).toBe(false);
    expect(isOpenRouterFreeModelId('nvidia/nemotron-3-super-120b-a12b:free')).toBe(false);
    expect(isOpenRouterFreeModelId('google/lyria-3-pro-preview')).toBe(false);
    expect(isOpenRouterFreeModelId('openai/gpt-4o')).toBe(false);
    expect(isOpenRouterFreeModelId('meta/llama:free')).toBe(false);
  });

  it('coerces non-allowlisted models to the default coding model', () => {
    expect(coerceOpenRouterFreeChatTarget('OpenAI', 'gpt-4o')).toEqual({
      providerName: 'OpenRouter',
      modelName: DEFAULT_OPENROUTER_CODING_MODEL,
    });
  });

  it('filters model lists to curated OpenRouter entries', () => {
    const models = filterOpenRouterFreeModels([
      {
        name: 'qwen/qwen3-coder-30b-a3b-instruct',
        label: 'Qwen3 Coder 30B',
        provider: 'OpenRouter',
        maxTokenAllowed: 160000,
      },
      { name: 'gpt-4o', label: 'GPT', provider: 'OpenAI', maxTokenAllowed: 128000 },
      { name: 'meta/llama:free', label: 'Llama', provider: 'OpenRouter', maxTokenAllowed: 128000 },
    ]);

    expect(models).toHaveLength(1);
    expect(models[0]?.name).toBe('qwen/qwen3-coder-30b-a3b-instruct');
  });

  it('resolves curated models with live context windows when available', () => {
    const models = resolveCuratedOpenRouterFreeModels([
      {
        id: 'qwen/qwen3-coder-30b-a3b-instruct',
        name: 'Qwen3 Coder 30B',
        context_length: 131072,
        pricing: { prompt: 0.00000007, completion: 0.00000027 },
      },
    ]);

    expect(models.find((model) => model.name === 'qwen/qwen3-coder-30b-a3b-instruct')?.maxTokenAllowed).toBe(131072);
    // The vision model is appended to the resolved list.
    expect(models.some((model) => model.name === 'qwen/qwen3.5-9b')).toBe(true);
  });

  it('detects allowlisted OpenRouter API models', () => {
    expect(isOpenRouterApiFreeModel({ id: 'nvidia/nemotron-3-nano-30b-a3b' })).toBe(true);
    expect(
      isOpenRouterApiFreeModel({
        id: 'vendor/model',
        pricing: { prompt: 0, completion: 0 },
      }),
    ).toBe(false);
  });
});
