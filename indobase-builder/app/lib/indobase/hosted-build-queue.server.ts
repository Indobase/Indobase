/**
 * Global FIFO queue for hosted builds (sandbox + server-build).
 * Prevents unbounded parallel npm install/build on the Builder task.
 */

const DEFAULT_CONCURRENCY = 2;

type Waiter = {
  resolve: () => void;
};

let active = 0;
let concurrency = DEFAULT_CONCURRENCY;
const waiters: Waiter[] = [];

export function getHostedBuildQueueStats() {
  return { active, waiting: waiters.length, concurrency };
}

/** Override concurrency (tests / staging). Clamped 1–4. */
export function setHostedBuildConcurrency(next: number) {
  concurrency = Math.max(1, Math.min(4, Math.floor(next) || DEFAULT_CONCURRENCY));
  drain();
}

function drain() {
  while (active < concurrency && waiters.length > 0) {
    const next = waiters.shift();

    if (!next) {
      break;
    }

    active += 1;
    next.resolve();
  }
}

async function acquire(): Promise<void> {
  if (active < concurrency) {
    active += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    waiters.push({ resolve });
  });
}

function release() {
  active = Math.max(0, active - 1);
  drain();
}

/** Run `fn` under the hosted-build semaphore. */
export async function withHostedBuildSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();

  try {
    return await fn();
  } finally {
    release();
  }
}
