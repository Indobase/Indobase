/**
 * Yield to the browser event loop so Chrome can paint and respond during long
 * synchronous/microtask bursts (large multi-file streams). Prefer MessageChannel
 * over setTimeout(0) — it schedules sooner and avoids the 4ms clamp.
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => resolve();
      port2.postMessage(undefined);

      return;
    }

    setTimeout(resolve, 0);
  });
}

/**
 * After every `batchSize` completed items (1-indexed count), yield so the UI
 * stays responsive during bulk file writes / store updates.
 */
export async function yieldAfterBatch(completedCount: number, batchSize: number = 4): Promise<void> {
  if (batchSize <= 0 || completedCount <= 0) {
    return;
  }

  if (completedCount % batchSize === 0) {
    await yieldToMain();
  }
}
