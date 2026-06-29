/**
 * Creates a function that samples calls at regular intervals and captures trailing calls.
 * - Drops calls that occur between sampling intervals
 * - Takes one call per sampling interval if available
 * - Captures the last call if no call was made during the interval
 *
 * @param fn The function to sample
 * @param sampleInterval How often to sample calls (in ms)
 * @returns The sampled function with a flush() helper
 */
export function createSampler<T extends (...args: any[]) => any>(
  fn: T,
  sampleInterval: number,
): T & { flush: () => Promise<void> } {
  let lastArgs: Parameters<T> | null = null;
  let lastTime = 0;
  let timeout: NodeJS.Timeout | null = null;
  let pendingFlush: Promise<void> | null = null;

  const runPending = async () => {
    if (!lastArgs) {
      return;
    }

    const args = lastArgs;
    lastArgs = null;
    await fn(...args);
  };

  const flush = () => {
    if (pendingFlush) {
      return pendingFlush;
    }

    pendingFlush = (async () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }

      await runPending();
      pendingFlush = null;
    })();

    return pendingFlush;
  };

  const sampled = function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    lastArgs = args;

    if (now - lastTime < sampleInterval) {
      if (!timeout) {
        timeout = setTimeout(
          () => {
            timeout = null;
            lastTime = Date.now();
            void runPending();
          },
          sampleInterval - (now - lastTime),
        );
      }

      return;
    }

    lastTime = now;
    void fn.apply(this, args);
    lastArgs = null;
  } as T;

  (sampled as T & { flush: () => Promise<void> }).flush = flush;

  return sampled as T & { flush: () => Promise<void> };
}
