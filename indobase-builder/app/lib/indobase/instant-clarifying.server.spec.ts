import { describe, expect, it } from 'vitest';
import type { Message } from 'ai';
import {
  CLARIFYING_ANSWERS_MARKER,
  getInstantClarifyingQuestions,
  userProvidedClarifyingAnswers,
} from './instant-clarifying';

function userMessage(content: string): Message {
  return { id: '1', role: 'user', content };
}

describe('instant-clarifying', () => {
  it('asks Emergent-style questions for a vague first Build prompt', () => {
    const questions = getInstantClarifyingQuestions([userMessage('create a website for my investment company')]);
    expect(questions?.length).toBeGreaterThanOrEqual(4);
    expect(questions?.[0]?.question).toMatch(/type of site/i);
  });

  it('skips questions after clarifying answers are provided', () => {
    const messages: Message[] = [
      userMessage('create a website for my investment company'),
      {
        id: '2',
        role: 'assistant',
        content: 'I have a few questions.',
      },
      userMessage(`${CLARIFYING_ANSWERS_MARKER}\n\n1. What type…\n→ One-page landing`),
    ];

    expect(userProvidedClarifyingAnswers(messages)).toBe(true);
    expect(getInstantClarifyingQuestions(messages)).toBeNull();
  });

  it('skips questions for a long specific brief', () => {
    const brief = [
      'Build a one-page investment firm site with hero, portfolio grid, thesis section,',
      'team bios, and a contact form that saves pitches. Use navy and gold. Include admin login.',
      'Wire Indobase auth and a companies table.',
    ].join(' ');

    expect(getInstantClarifyingQuestions([userMessage(brief)])).toBeNull();
  });
});
