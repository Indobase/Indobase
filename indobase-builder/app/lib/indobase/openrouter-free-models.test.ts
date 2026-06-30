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
  it('accepts only curated free coding model ids', () => {
    expect(isOpenRouterFreeModelId('qwen/qwen3-coder:free')).toBe(true);
    expect(isOpenRouterFreeModelId('nvidia/nemotron-3-super-120b-a12b:free')).toBe(true);
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

  it('filters model lists to curated OpenRouter free entries', () => {
    const models = filterOpenRouterFreeModels([
      { name: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder', provider: 'OpenRouter', maxTokenAllowed: 1048576 },
      { name: 'gpt-4o', label: 'GPT', provider: 'OpenAI', maxTokenAllowed: 128000 },
      { name: 'meta/llama:free', label: 'Llama', provider: 'OpenRouter', maxTokenAllowed: 128000 },
    ]);

    expect(models).toHaveLength(1);
    expect(models[0]?.name).toBe('qwen/qwen3-coder:free');
  });

  it('resolves curated models with live context windows when available', () => {
    const models = resolveCuratedOpenRouterFreeModels([
      {
        id: 'qwen/qwen3-coder:free',
        name: 'Qwen3 Coder',
        context_length: 900000,
        pricing: { prompt: 0, completion: 0 },
      },
    ]);

    expect(models.find((model) => model.name === 'qwen/qwen3-coder:free')?.maxTokenAllowed).toBe(900000);
    expect(models.some((model) => model.name === 'nvidia/nemotron-nano-12b-v2-vl:free')).toBe(true);
  });

  it('detects allowlisted OpenRouter API models', () => {
    expect(isOpenRouterApiFreeModel({ id: 'cohere/north-mini-code:free' })).toBe(true);
    expect(
      isOpenRouterApiFreeModel({
        id: 'vendor/model',
        pricing: { prompt: 0, completion: 0 },
      }),
    ).toBe(false);
  });
});
