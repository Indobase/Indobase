import type { Message } from 'ai';
import type { ClarifyingQuestion } from '~/lib/.server/orchestration/planner';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import { isInitialScaffoldTurn } from '~/lib/indobase/generation-contract';
import { CLARIFYING_ANSWERS_MARKER } from '~/lib/indobase/clarifying-answers';

export { CLARIFYING_ANSWERS_MARKER };

/**
 * Emergent-style default intake for vague first Build prompts.
 * Kept local (no LLM round-trip) so the questions card appears immediately.
 */
export const DEFAULT_SITE_CLARIFYING_QUESTIONS: ClarifyingQuestion[] = [
  {
    question: 'What type of site do you want?',
    suggestions: [
      'One-page landing site (hero, about, portfolio, contact)',
      'Multi-section marketing site (home, about us, investment thesis, portfolio, team, contact)',
      'Something else',
    ],
    recommended: 'Multi-section marketing site (home, about us, investment thesis, portfolio, team, contact)',
  },
  {
    question: 'What content should it highlight?',
    suggestions: [
      'Portfolio of investments / case studies',
      'Investment focus / thesis',
      'Team and track record',
      'You decide — make it distinctive',
    ],
    recommended: 'You decide — make it distinctive',
  },
  {
    question: 'Should visitors be able to reach out through the site?',
    suggestions: [
      'Yes — a contact / pitch form that saves submissions',
      'Yes — email and phone only',
      'No contact form for now',
    ],
    recommended: 'Yes — a contact / pitch form that saves submissions',
  },
  {
    question: 'Any design preference?',
    suggestions: [
      'Dark, premium, editorial (classic family-office look)',
      'Light, clean, minimal',
      'You decide — make it distinctive',
      'Something else',
    ],
    recommended: 'You decide — make it distinctive',
  },
  {
    question: 'Do you need an admin area to manage content?',
    suggestions: [
      'Yes, with a simple admin login',
      'Not yet — public site only',
    ],
    recommended: 'Not yet — public site only',
  },
];

function lastUserText(messages: Message[]): string {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');

  if (!lastUser) {
    return '';
  }

  try {
    return extractPropertiesFromMessage(lastUser).content.trim();
  } catch {
    return typeof lastUser.content === 'string' ? lastUser.content.trim() : '';
  }
}

export function userProvidedClarifyingAnswers(messages: Message[]): boolean {
  return messages.some((message) => {
    if (message.role !== 'user') {
      return false;
    }

    const text = typeof message.content === 'string' ? message.content : '';

    return text.includes(CLARIFYING_ANSWERS_MARKER);
  });
}

/**
 * Returns intake questions for the first vague Build turn, or null when we should build now.
 * Server-only — imported from api.chat / orchestration.
 */
export function getInstantClarifyingQuestions(messages: Message[]): ClarifyingQuestion[] | null {
  if (!isInitialScaffoldTurn(messages)) {
    return null;
  }

  if (userProvidedClarifyingAnswers(messages)) {
    return null;
  }

  const text = lastUserText(messages);

  if (!text) {
    return null;
  }

  // Long, already-specified briefs skip the card.
  if (text.length > 420) {
    return null;
  }

  const specificityHits =
    (/\b(hero|portfolio|auth|login|dashboard|admin|contact form|pricing|checkout)\b/i.test(text) ? 1 : 0) +
    (/\b(and|with|including)\b/i.test(text) && text.length > 140 ? 1 : 0) +
    (text.split(/[.!?]/).filter((part) => part.trim().length > 20).length >= 3 ? 1 : 0);

  if (specificityHits >= 2) {
    return null;
  }

  return DEFAULT_SITE_CLARIFYING_QUESTIONS;
}
