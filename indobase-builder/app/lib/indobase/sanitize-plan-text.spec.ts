import { describe, expect, it } from 'vitest';

import {
  cleanUserPromptForPlan,
  sanitizePlanSteps,
  scrubPlanStepInternals,
  stripInternalRoutingAnnotations,
} from './sanitize-plan-text';

describe('sanitize-plan-text', () => {
  it('strips Model and Provider annotations from prompts', () => {
    const raw = `[Model: qwen/qwen3.5-flash-02-23]\n\n[Provider: OpenRouter]\n\nBuild a todo app`;

    expect(stripInternalRoutingAnnotations(raw)).toBe('Build a todo app');
    expect(cleanUserPromptForPlan(raw)).toBe('Build a todo app');
  });

  it('drops model/provider and tool-error junk from plan steps', () => {
    const steps = sanitizePlanSteps([
      'Create a minimal Vite + React + TypeScript app',
      'Implement: [Model: qwen/qwen3.5-flash-02-23]',
      '[Provider: OpenRouter]',
      'The "path" argument must be of type string.',
      'Keep files few; apply a non-purple industry-fit palette',
      'npm install then npm run dev in the same response',
      'TypeError: Cannot read properties of undefined',
    ]);

    expect(steps).toEqual([
      'Create a minimal Vite + React + TypeScript app',
      'Keep files few; apply a non-purple industry-fit palette',
      'npm install then npm run dev in the same response',
    ]);
  });

  it('scrubs bare model ids from plan step text', () => {
    expect(scrubPlanStepInternals('Use qwen/qwen3.5-flash-02-23 via OpenRouter')).toBe('Use via');
    expect(scrubPlanStepInternals('Build with thinkingmachines/inkling-small')).toBe('Build with');
  });
});
