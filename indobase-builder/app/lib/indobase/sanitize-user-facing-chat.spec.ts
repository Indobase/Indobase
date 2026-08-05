import { describe, expect, it } from 'vitest';
import { isEmptyConversationalText, toConversationalAssistantText } from './sanitize-user-facing-chat';

describe('toConversationalAssistantText', () => {
  it('strips BUILD PLAN / Vite / npm dumps', () => {
    const raw = `I'll build that for you.

## Build steps
1. Scaffold a Vite + React + TypeScript app
2. Implement the UI
3. npm install then npm run dev

Autonomy checklist
- [x] Skip unused auth

Creating files…`;

    const out = toConversationalAssistantText(raw);
    expect(out.toLowerCase()).toContain("i'll build");
    expect(out.toLowerCase()).not.toContain('vite');
    expect(out.toLowerCase()).not.toContain('npm');
    expect(out.toLowerCase()).not.toContain('build steps');
  });

  it('returns empty when only technical noise', () => {
    const raw = `## Build steps
1. Create a minimal Vite + React + TypeScript app
2. npm install`;

    expect(toConversationalAssistantText(raw)).toBe('');
    expect(isEmptyConversationalText(raw)).toBe(true);
  });

  it('strips model annotations', () => {
    const out = toConversationalAssistantText(
      `[Model: openai/gpt-5.6-luna]\n\n[Provider: OpenRouter]\n\nGot it — starting now.`,
    );
    expect(out).toBe('Got it — starting now.');
    expect(out).not.toContain('OpenRouter');
  });
});
