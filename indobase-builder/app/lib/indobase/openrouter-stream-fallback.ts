import { streamText as _streamText } from 'ai';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('openrouter-fallback');

type StreamTextResult = Awaited<ReturnType<typeof _streamText>>;

export function isOpenRouterRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { statusCode?: number; message?: string; status?: number };

  return (
    candidate.statusCode === 429 ||
    candidate.status === 429 ||
    /rate limit|too many requests/i.test(candidate.message ?? '')
  );
}

function prependAsyncIterator<T>(first: T | undefined, iterator: AsyncIterator<T>): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      if (first !== undefined) {
        yield first;
      }

      while (true) {
        const next = await iterator.next();

        if (next.done) {
          break;
        }

        yield next.value;
      }
    },
  };
}

export async function streamOpenRouterWithFallback({
  fallbackModels,
  buildStreamParams,
}: {
  fallbackModels: string[];
  buildStreamParams: (modelName: string) => Parameters<typeof _streamText>[0];
}): Promise<StreamTextResult> {
  let lastRateLimitError: unknown;

  for (let index = 0; index < fallbackModels.length; index++) {
    const modelName = fallbackModels[index]!;
    const result = await _streamText(buildStreamParams(modelName));
    const iterator = result.fullStream[Symbol.asyncIterator]();
    const first = await iterator.next();

    if (!first.done && first.value?.type === 'error' && isOpenRouterRateLimitError(first.value.error)) {
      lastRateLimitError = first.value.error;
      logger.warn(`OpenRouter model ${modelName} rate limited (${index + 1}/${fallbackModels.length})`);

      if (index < fallbackModels.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }

      throw first.value.error;
    }

    if (!first.done && first.value?.type === 'error') {
      throw first.value.error;
    }

    const patchedFullStream = prependAsyncIterator(first.done ? undefined : first.value, iterator);

    // streamText results expose fullStream as a read-only getter — wrap instead of assigning.
    return new Proxy(result, {
      get(target, prop, receiver) {
        if (prop === 'fullStream') {
          return patchedFullStream;
        }

        return Reflect.get(target, prop, receiver);
      },
    }) as StreamTextResult;
  }

  throw lastRateLimitError ?? new Error('OpenRouter rate limited on all free models. Please wait a moment and try again.');
}
