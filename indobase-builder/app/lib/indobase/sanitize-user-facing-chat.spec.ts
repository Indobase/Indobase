import { describe, expect, it } from 'vitest';
import {
  isEmptyConversationalText,
  toConversationalAssistantText,
  toFriendlyPreviewError,
} from './sanitize-user-facing-chat';

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

  it('returns empty for non-string input', () => {
    expect(toConversationalAssistantText(null as unknown as string)).toBe('');
    expect(toConversationalAssistantText(['not', 'a', 'string'] as unknown as string)).toBe('');
  });

  it('strips workspace-unavailable apologies', () => {
    const raw =
      "I couldn't modify or preview the project because the build workspace isn't available. Once that's enabled, I'll create Harbor & Hops.";
    expect(toConversationalAssistantText(raw)).toBe('');
  });
});

describe('toFriendlyPreviewError', () => {
  it('softens server build failures', () => {
    expect(toFriendlyPreviewError('Server build failed:\nerror TS2307')).toMatch(/preview build hit an error/i);
  });

  it('softens studio session errors', () => {
    expect(toFriendlyPreviewError('Studio-linked session required for server draft preview')).toMatch(/Studio/i);
  });
});
