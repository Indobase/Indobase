import { memo, useEffect, useMemo, useState } from 'react';
import type { Message } from 'ai';
import { classNames } from '~/utils/classNames';
import { CLARIFYING_ANSWERS_MARKER } from '~/lib/indobase/clarifying-answers';
import { beginInitialBuild } from '~/lib/stores/build-lifecycle';

export type ClarifyingQuestionView = {
  question: string;
  why?: string;
  suggestions?: string[];
  /** Preferred / recommended option (Emergent-style). */
  recommended?: string;
};

interface ClarifyingQuestionsCardProps {
  questions: ClarifyingQuestionView[];
  /** Prefer sendMessage so auth, quota, and beginCodegenCommand run. */
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  /** Fallback only when sendMessage is unavailable. */
  append?: (message: Message) => void;
  model?: string;
  providerName?: string;
}

function pickRecommended(question: ClarifyingQuestionView): string {
  const suggestions = question.suggestions?.filter(Boolean) ?? [];
  if (question.recommended && suggestions.includes(question.recommended)) {
    return question.recommended;
  }

  const youDecide = suggestions.find((s) => /you decide/i.test(s));
  if (youDecide) {
    return youDecide;
  }

  return suggestions[0] || 'You decide — make it distinctive';
}

/**
 * Emergent-style intake card: one question at a time, multi-choice with Recommended,
 * Auto-answer + Next.
 */
export const ClarifyingQuestionsCard = memo(
  ({ questions, sendMessage, append, model, providerName }: ClarifyingQuestionsCardProps) => {
    const safeQuestions = useMemo(
      () => questions.filter((q) => typeof q.question === 'string' && q.question.trim().length > 0),
      [questions],
    );
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [customText, setCustomText] = useState('');
    const [submitted, setSubmitted] = useState(false);

    // Pre-select the recommended option for the current question (Emergent behavior).
    useEffect(() => {
      if (safeQuestions.length === 0) {
        return;
      }

      const current = safeQuestions[index];
      if (!current) {
        return;
      }

      setAnswers((prev) => {
        if (prev[index]?.trim()) {
          return prev;
        }

        return { ...prev, [index]: pickRecommended(current) };
      });
      setCustomText('');
    }, [index, safeQuestions]);

    if (safeQuestions.length === 0 || submitted) {
      return null;
    }

    const current = safeQuestions[index];
    const suggestions = current.suggestions?.filter(Boolean) ?? [];
    const recommended = pickRecommended(current);
    const selected = answers[index] ?? recommended;
    const isLast = index >= safeQuestions.length - 1;
    const canAdvance = selected.trim().length > 0;
    const canSubmit = Boolean(sendMessage || append);

    const selectOption = (value: string) => {
      setAnswers((prev) => ({ ...prev, [index]: value }));
      setCustomText('');
    };

    const submitAll = (finalAnswers: Record<number, string>) => {
      if (!sendMessage && !append) {
        return;
      }

      const lines = safeQuestions.map((q, i) => {
        const answer = finalAnswers[i]?.trim() || pickRecommended(q);
        return `${i + 1}. ${q.question}\n→ ${answer}`;
      });

      // Plain body — sendMessage wraps Model/Provider and runs auth/quota/codegen lifecycle.
      const body = `${CLARIFYING_ANSWERS_MARKER}\n\n${lines.join('\n\n')}\n\nBuild with these decisions.`;

      setSubmitted(true);

      if (sendMessage) {
        sendMessage({} as React.UIEvent, body);
        return;
      }

      beginInitialBuild();
      const content =
        model && providerName ? `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n${body}` : body;
      append!({
        role: 'user',
        content,
      } as Message);
    };

    /** Fill every unanswered step with its recommendation and start the build. */
    const autoAnswer = () => {
      const complete: Record<number, string> = { ...answers };
      safeQuestions.forEach((q, i) => {
        if (!complete[i]?.trim()) {
          complete[i] = pickRecommended(q);
        }
      });
      submitAll(complete);
    };

    const goNext = () => {
      const resolved = {
        ...answers,
        [index]: (answers[index] || recommended).trim(),
      };

      if (!resolved[index]) {
        return;
      }

      if (isLast) {
        // Fill any unanswered steps with their recommendations before build.
        const complete = { ...resolved };
        safeQuestions.forEach((q, i) => {
          if (!complete[i]?.trim()) {
            complete[i] = pickRecommended(q);
          }
        });
        submitAll(complete);
        return;
      }

      setAnswers(resolved);
      setIndex((value) => value + 1);
      setCustomText('');
    };

    const goBack = () => {
      if (index === 0) {
        return;
      }

      setIndex((value) => value - 1);
      setCustomText('');
    };

    return (
      <div className="mb-3 overflow-hidden rounded-2xl border border-[#BFD9FF] bg-[#F3F8FF] shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-[#D6E7FF] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2F6FED] text-white">
              <span className="i-ph:chat-circle-dots text-sm" />
            </span>
            Agent has questions for you
          </div>
          <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-[#2F6FED]">
            Question {index + 1} of {safeQuestions.length}
          </span>
        </div>

        <div className="px-4 py-4">
          <p className="mb-3 text-[15px] font-medium text-gray-900">{current.question}</p>
          {current.why ? <p className="mb-3 text-xs text-gray-500">{current.why}</p> : null}

          <div className="flex flex-col gap-2">
            {suggestions.map((option) => {
              const active = selected === option;
              const isRecommended = option === recommended;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectOption(option)}
                  className={classNames(
                    'flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                    active
                      ? 'border-[#2F6FED] bg-white text-gray-900 shadow-sm'
                      : 'border-transparent bg-white/70 text-gray-700 hover:border-gray-200 hover:bg-white',
                  )}
                >
                  <span
                    className={classNames(
                      'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px]',
                      active ? 'border-[#2F6FED] bg-[#2F6FED] text-white' : 'border-gray-300 bg-white text-transparent',
                    )}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{option}</span>
                    {isRecommended ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#EAF2FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2F6FED]">
                        <span className="i-ph:sparkle-fill text-[10px]" aria-hidden />
                        Recommended
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}

            <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-3 py-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">Something else</label>
              <input
                value={customText}
                onChange={(event) => {
                  const value = event.target.value;
                  setCustomText(value);
                  if (value.trim()) {
                    setAnswers((prev) => ({ ...prev, [index]: value }));
                  }
                }}
                placeholder="Type your own answer…"
                className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#D6E7FF] bg-white/50 px-4 py-3">
          <button
            type="button"
            onClick={goBack}
            disabled={index === 0}
            className="rounded-lg px-2 py-1.5 text-sm text-gray-600 disabled:opacity-40"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={autoAnswer}
              disabled={!canSubmit}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Auto-answer
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!canAdvance || (isLast && !canSubmit)}
              className="rounded-xl bg-[#2F6FED] px-4 py-1.5 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
            >
              {isLast ? 'Build' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
