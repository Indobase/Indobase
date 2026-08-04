/**
 * Client-side noise helpers for Builder: expected WC fallbacks, stale deploy chunks,
 * and browser-extension junk that should not page Sentry or strand users on a blank screen.
 */

export function isStaleChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(
    message,
  );
}

export function isBrowserExtensionNoise(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /contentscript|ObjectMultiplex|chrome-extension:\/\/|moz-extension:\/\//i.test(message);
}

const STALE_CHUNK_RELOAD_KEY = 'indobase-builder:stale-chunk-reload';

/** In-memory latch for the current page lifetime (sessionStorage may be blocked). */
let staleChunkReloadAttempted = false;

/**
 * One-shot hard reload when a hashed asset 404s after a Swarm roll (BUILDER-2).
 * Guards with sessionStorage + in-memory latch so a permanently broken deploy cannot loop forever.
 */
export function reloadOnceForStaleChunk(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  reload: () => void = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  },
): boolean {
  if (staleChunkReloadAttempted) {
    return false;
  }

  try {
    if (storage?.getItem(STALE_CHUNK_RELOAD_KEY) === '1') {
      return false;
    }

    storage?.setItem(STALE_CHUNK_RELOAD_KEY, '1');
  } catch {
    // Private mode / blocked storage — in-memory latch still prevents same-page loops.
  }

  staleChunkReloadAttempted = true;
  reload();
  return true;
}

/** Test-only: clear latches between cases. */
export function resetStaleChunkReloadLatchForTests(): void {
  staleChunkReloadAttempted = false;
}

export function installStaleChunkReloadHandlers(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const onUnhandled = (event: PromiseRejectionEvent) => {
    if (!isStaleChunkLoadError(event.reason)) {
      return;
    }

    event.preventDefault();
    reloadOnceForStaleChunk();
  };

  const onVitePreload = (event: Event) => {
    event.preventDefault();
    reloadOnceForStaleChunk();
  };

  window.addEventListener('unhandledrejection', onUnhandled);
  window.addEventListener('vite:preloadError', onVitePreload);

  return () => {
    window.removeEventListener('unhandledrejection', onUnhandled);
    window.removeEventListener('vite:preloadError', onVitePreload);
  };
}
