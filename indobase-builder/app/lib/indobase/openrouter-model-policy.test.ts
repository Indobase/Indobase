import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPENROUTER_CHAT_MODEL,
  OPENROUTER_PAID_CODEGEN_MODEL,
  resolveOpenRouterModelForTask,
} from './openrouter-model-policy';

describe('openrouter-model-policy', () => {
  it('routes discuss chat to free models', () => {
    expect(resolveOpenRouterModelForTask('chat', 'OpenAI', 'gpt-4o')).toEqual({
      providerName: 'OpenRouter',
      modelName: DEFAULT_OPENROUTER_CHAT_MODEL,
    });
  });

  it('routes planning to a free model', () => {
    const resolved = resolveOpenRouterModelForTask('planning', 'OpenRouter', 'qwen/qwen3-coder:free');
    expect(resolved.providerName).toBe('OpenRouter');
    expect(resolved.modelName).toContain(':free');
    expect(resolved.modelName).not.toBe(OPENROUTER_PAID_CODEGEN_MODEL);
  });

  it('routes codegen and debugging to DeepSeek V4 Pro', () => {
    expect(resolveOpenRouterModelForTask('codegen', 'OpenRouter', 'qwen/qwen3-coder:free')).toEqual({
      providerName: 'OpenRouter',
      modelName: OPENROUTER_PAID_CODEGEN_MODEL,
    });

    expect(resolveOpenRouterModelForTask('debugging', 'OpenRouter', 'qwen/qwen3-coder:free')).toEqual({
      providerName: 'OpenRouter',
      modelName: OPENROUTER_PAID_CODEGEN_MODEL,
    });
  });
});
