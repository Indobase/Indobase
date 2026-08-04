import { memo, useMemo, useState } from 'react';
import type { Message } from 'ai';
import { classNames } from '~/utils/classNames';
import { CLARIFYING_ANSWERS_MARKER } from '~/lib/indobase/instant-clarifying';
import { beginInitialBuild } from '~/lib/stores/build-lifecycle';

export type ClarifyingQuestionView = {
  question: string;
  why?: string;
  suggestions?: string[];
};

interface ClarifyingQuestionsCardProps {
  questions: ClarifyingQuestionView[];
  append?: (message: Message) => void;
  model?: string;
  providerName?: string;
}

/**
 * Emergent-style intake card: one question at a time, multi-choice, Auto-answer + Next.
 */
export const ClarifyingQuestionsCard = memo(
  ({ questions, append, model, providerName }: ClarifyingQuestionsCardProps) => {
    const safeQuestions = useMemo(
      () => questions.filter((q) => typeof q.question === 'string' && q.question.trim().length > 0),
      [questions],
    );
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [customText, setCustomText] = useState('');
    const [submitted, setSubmitted] = useState(false);

    if (safeQuestions.length === 0 || submitted) {
      return null;
    }

    const current = safeQuestions[index];
    const suggestions = current.suggestions?.filter(Boolean) ?? [];
    const selected = answers[index] ?? '';
    const isLast = index >= safeQuestions.length - 1;
    const canAdvance = selected.trim().length > 0;

    const selectOption = (value: string) => {
      setAnswers((prev) => ({ ...prev, [index]: value }));
      setCustomText('');
    };

    const autoAnswer = () => {
      const pick = suggestions[0] || 'You decide — make it distinctive';
      selectOption(pick);
    };

    const submitAll = (finalAnswers: Record<number, string>) => {
      if (!append) {
        return;
      }

      const lines = safeQuestions.map((q, i) => {
        const answer = finalAnswers[i]?.trim() || suggestions[0] || 'You decide';
        return `${i + 1}. ${q.question}\n→ ${answer}`;
      });

      const body = `${CLARIFYING_ANSWERS_MARKER}\n\n${lines.join('\n\n')}\n\nBuild with these decisions.`;
      const content =
        model && providerName ? `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n${body}` : body;

      setSubmitted(true);
      beginInitialBuild();
      append({
        role: 'user',
        content,
      } as Message);
    };

    const goNext = () => {
      if (!canAdvance) {
        return;
      }

      if (isLast) {
        submitAll(answers);
        return;
      }

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
            <span className="i-ph:info text-base text-[#2F6FED]" />
            Agent has questions for you
          </div>
          <span className="text-xs font-medium text-gray-500">
            Question {index + 1} of {safeQuestions.length}
          </span>
        </div>

        <div className="px-4 py-4">
          <p className="mb-3 text-[15px] font-medium text-gray-900">{current.question}</p>
          {current.why ? <p className="mb-3 text-xs text-gray-500">{current.why}</p> : null}

          <div className="flex flex-col gap-2">
            {suggestions.map((option) => {
              const active = selected === option;

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
                  <span>{option}</span>
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
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Auto-answer
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!canAdvance}
              className="rounded-lg bg-[#2F6FED] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {isLast ? 'Build' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
