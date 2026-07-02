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

export function isOpenRouterRetryableError(error: unknown): boolean {
  if (isOpenRouterRateLimitError(error)) {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { statusCode?: number; message?: string; status?: number; name?: string };

  return (
    candidate.statusCode === 400 ||
    candidate.status === 400 ||
    candidate.name === 'AI_APICallError' ||
    /bad request|invalid model|model not found|temporarily unavailable|overloaded/i.test(candidate.message ?? '')
  );
}

export async function streamOpenRouterWithFallback({
  fallbackModels,
  buildStreamParams,
}: {
  fallbackModels: string[];
  buildStreamParams: (modelName: string) => Parameters<typeof _streamText>[0];
}): Promise<StreamTextResult> {
  let lastRetryableError: unknown;

  for (let index = 0; index < fallbackModels.length; index++) {
    const modelName = fallbackModels[index]!;
    let result: StreamTextResult;

    try {
      result = await _streamText(buildStreamParams(modelName));
    } catch (error) {
      if (isOpenRouterRetryableError(error) && index < fallbackModels.length - 1) {
        lastRetryableError = error;
        logger.warn(`OpenRouter model ${modelName} failed to start stream (${index + 1}/${fallbackModels.length})`);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }

      throw error;
    }

    /*
     * `fullStream` is a getter that yields an independent, fully-featured
     * ReadableStream on each access — the SDK reads it more than once (our
     * error-watching for-await AND mergeIntoDataStream, which internally calls
     * fullStream.pipeThrough). Peek a private copy to detect an immediate
     * provider error so we can fall back to the next free model, then release
     * that copy. Reading the first chunk here does NOT remove it from later
     * accesses (the getter tees), so we return the SDK result unmodified.
     *
     * Do NOT replace fullStream with a bare async-iterable: it lacks
     * `.pipeThrough`, which crashed mergeIntoDataStream with
     * "Custom error: this.fullStream.pipeThrough is not a function".
     */
    const iterator = result.fullStream[Symbol.asyncIterator]();
    const first = await iterator.next();

    // Release the peek branch so the underlying tee doesn't buffer the whole
    // stream for a consumer we abandon (the retained branch is unaffected).
    void iterator.return?.(undefined);

    if (!first.done && first.value?.type === 'error' && isOpenRouterRetryableError(first.value.error)) {
      lastRetryableError = first.value.error;
      logger.warn(`OpenRouter model ${modelName} failed (${index + 1}/${fallbackModels.length})`);

      if (index < fallbackModels.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }

      throw first.value.error;
    }

    if (!first.done && first.value?.type === 'error') {
      throw first.value.error;
    }

    return result;
  }

  throw (
    lastRetryableError ??
    new Error('OpenRouter failed on all free models. Please wait a moment and try again.')
  );
}
