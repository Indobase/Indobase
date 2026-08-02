import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPENROUTER_CHAT_MODEL,
  OPENROUTER_FAST_CODEGEN_MODEL,
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

  it('routes planning to the cheap paid planning model', () => {
    const resolved = resolveOpenRouterModelForTask('planning', 'OpenRouter', 'qwen/qwen3-coder-30b-a3b-instruct');
    expect(resolved.providerName).toBe('OpenRouter');
    expect(resolved.modelName).toBe('openai/gpt-oss-120b');
    expect(resolved.modelName).not.toBe(OPENROUTER_PAID_CODEGEN_MODEL);
  });

  it('routes all Build codegen (simple + complex) to the fast Flash model', () => {
    expect(resolveOpenRouterModelForTask('scaffold', 'OpenRouter', 'deepseek/deepseek-v4-pro')).toEqual({
      providerName: 'OpenRouter',
      modelName: OPENROUTER_FAST_CODEGEN_MODEL,
    });
    expect(resolveOpenRouterModelForTask('codegen', 'OpenRouter', 'qwen/qwen3-coder:free')).toEqual({
      providerName: 'OpenRouter',
      modelName: OPENROUTER_FAST_CODEGEN_MODEL,
    });
    expect(OPENROUTER_FAST_CODEGEN_MODEL).toBe('qwen/qwen3.5-flash-02-23');
  });

  it('reserves DeepSeek V4 Pro for debugging/repair only', () => {
    expect(resolveOpenRouterModelForTask('debugging', 'OpenRouter', 'qwen/qwen3-coder:free')).toEqual({
      providerName: 'OpenRouter',
      modelName: OPENROUTER_PAID_CODEGEN_MODEL,
    });
  });
});
