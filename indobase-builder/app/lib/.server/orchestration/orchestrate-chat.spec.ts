import { describe, expect, it } from 'vitest';
import { injectPlannerPlan } from '~/lib/.server/orchestration/orchestrate-chat';

describe('injectPlannerPlan', () => {
  it('injects the planner output into the latest user message', () => {
    const messages = [
      { id: '1', role: 'user' as const, content: '[Model: test]\n\n[Provider: OpenRouter]\n\nBuild a todo app' },
    ];

    const updated = injectPlannerPlan(messages, '## Plan\n- Create Vite app');

    expect(updated[0].content).toContain('<agent_plan>');
    expect(updated[0].content).toContain('Create Vite app');
    expect(updated[0].content).toContain('Build a todo app');
  });
});
