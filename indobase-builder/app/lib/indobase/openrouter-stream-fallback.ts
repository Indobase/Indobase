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
    /*
     * 402 = out of credits on a paid model. Retryable for our purposes: fall through to the free
     * models so a build still completes instead of failing outright.
     */
    candidate.statusCode === 402 ||
    candidate.status === 402 ||
    candidate.name === 'AI_APICallError' ||
    /bad request|invalid model|model not found|temporarily unavailable|overloaded|insufficient credits|payment required/i.test(
      candidate.message ?? '',
    )
  );
}

/**
 * Best-effort extraction of when an OpenRouter rate limit resets, as an epoch
 * in ms. OpenRouter returns `X-RateLimit-Reset` (epoch ms) on 429s — exposed by
 * the AI SDK on `responseHeaders`, and mirrored in the error body under
 * `error.metadata.headers`. Falls back to a `Retry-After` (seconds) header.
 */
export function getRateLimitResetAt(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const e = error as {
    responseHeaders?: Record<string, string>;
    headers?: Record<string, string>;
    cause?: { responseHeaders?: Record<string, string> };
    data?: { error?: { metadata?: { headers?: Record<string, string> } } };
    responseBody?: { error?: { metadata?: { headers?: Record<string, string> } } };
    message?: string;
  };

  const fromHeaders = (h?: Record<string, string>): number | null => {
    if (!h) {
      return null;
    }

    const lower: Record<string, string> = {};

    for (const [k, v] of Object.entries(h)) {
      lower[k.toLowerCase()] = String(v);
    }

    const reset = lower['x-ratelimit-reset'];

    if (reset) {
      const n = Number(reset);

      if (Number.isFinite(n) && n > 0) {
        // OpenRouter uses epoch ms; treat small values as epoch seconds.
        return n > 1e12 ? n : n * 1000;
      }
    }

    const retryAfter = lower['retry-after'];

    if (retryAfter) {
      const secs = Number(retryAfter);

      if (Number.isFinite(secs) && secs >= 0) {
        return Date.now() + secs * 1000;
      }
    }

    return null;
  };

  return (
    fromHeaders(e.responseHeaders ?? e.headers ?? e.cause?.responseHeaders) ??
    fromHeaders(e.data?.error?.metadata?.headers ?? e.responseBody?.error?.metadata?.headers) ??
    null
  );
}

/**
 * A short, human-friendly rate-limit message with the wait time, or null if the
 * error is not a rate limit. Used in place of the long generic "API limit
 * exceeded" text so users know exactly when they can retry.
 */
export function describeRateLimit(error: unknown): string | null {
  if (!isOpenRouterRateLimitError(error)) {
    return null;
  }

  const resetAt = getRateLimitResetAt(error);
  const remainingMs = resetAt ? resetAt - Date.now() : 0;

  if (!resetAt || remainingMs <= 0) {
    return "The AI provider is rate limiting us. Try again in a few seconds.";
  }

  const totalSec = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  let eta: string;

  if (hours > 0) {
    eta = `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    eta = `${minutes}m ${seconds}s`;
  } else {
    eta = `${seconds}s`;
  }

  return `The AI provider is rate limiting us. Try again in about ${eta}.`;
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
     * provider error so we can fall back to the next model, then release
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

  // Re-throw the original provider error so the caller's onError handler can
  // read its rate-limit reset headers (see describeRateLimit); only synthesize
  // a message when we have nothing.
  if (lastRetryableError) {
    throw lastRetryableError;
  }

  throw new Error('All AI models are unavailable right now. Please try again in a moment.');
}
