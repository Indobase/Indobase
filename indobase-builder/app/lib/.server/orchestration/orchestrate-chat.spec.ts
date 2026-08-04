import { describe, expect, it } from 'vitest';
import { extractPlanSteps, injectPlannerPlan } from '~/lib/.server/orchestration/orchestrate-chat';
import { parseScopingResponse } from '~/lib/.server/orchestration/planner';

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

describe('extractPlanSteps', () => {
  it('reads the Build steps list and stops at the next heading', () => {
    const plan = [
      '## Build steps',
      '1. Create the data model',
      '2. **Build the dashboard**',
      '3. Add auth',
      '',
      '## Architecture',
      '- Vite + React',
    ].join('\n');

    expect(extractPlanSteps(plan)).toEqual(['Create the data model', 'Build the dashboard', 'Add auth']);
  });

  it('caps at 7 steps so the checklist stays readable', () => {
    const plan = ['## Build steps', ...Array.from({ length: 12 }, (_, i) => `${i + 1}. Step ${i + 1}`)].join('\n');
    expect(extractPlanSteps(plan)).toHaveLength(7);
  });

  it('filters Model/Provider lines that naive splits would have promoted to steps', () => {
    const contaminated = [
      '## Build steps',
      '1. Create a minimal Vite + React + TypeScript app',
      '2. Implement: [Model: qwen/qwen3.5-flash-02-23]',
      '[Provider: OpenRouter]',
      'The "path" argument must be of type string.',
      '3. Keep files few; apply a non-purple industry-fit palette',
      '4. npm install then npm run dev in the same response',
    ].join('\n');

    expect(extractPlanSteps(contaminated)).toEqual([
      'Create a minimal Vite + React + TypeScript app',
      'Keep files few; apply a non-purple industry-fit palette',
      'npm install then npm run dev in the same response',
    ]);
  });
});

describe('parseScopingResponse', () => {
  it('detects questions and caps them at 3', () => {
    const raw = JSON.stringify({
      needsClarification: true,
      questions: [{ question: 'Who logs in?' }, { question: 'b' }, { question: 'c' }, { question: 'd' }],
    });

    const result = parseScopingResponse(raw);
    expect(result.needsClarification).toBe(true);
    expect(result.questions).toHaveLength(3);
  });

  it('tolerates ```json fences and surrounding prose (weaker models add both)', () => {
    const fenced = '```json\n{"needsClarification":true,"questions":[{"question":"Auth?"}]}\n```';
    expect(parseScopingResponse(fenced).needsClarification).toBe(true);

    const prose = 'Sure! {"needsClarification":true,"questions":[{"question":"Auth?"}]} hope that helps';
    expect(parseScopingResponse(prose).needsClarification).toBe(true);
  });

  /** Scoping must never stall a build — anything unusable proceeds straight to planning. */
  it('fails open on garbage, empty questions, or explicit false', () => {
    expect(parseScopingResponse('total garbage').needsClarification).toBe(false);
    expect(parseScopingResponse('{"needsClarification":true,"questions":[]}').needsClarification).toBe(false);
    expect(parseScopingResponse('{"needsClarification":false}').needsClarification).toBe(false);
    expect(parseScopingResponse('').needsClarification).toBe(false);
  });
});
