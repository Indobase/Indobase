import { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';

export const webcontainerBootErrorAtom = atom<string | null>(null);

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data?.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot?.data) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

const WEBCONTAINER_BOOT_TIMEOUT_MS = 90_000;
const WEBCONTAINER_CONFIGURE_TIMEOUT_MS = 20_000;
const WEBCONTAINER_BOOT_MAX_ATTEMPTS = 2;
const STACKBLITZ_HEADLESS_PROBE_MS = 8_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function assertWebContainerRuntimeReady(): Promise<void> {
  if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) {
    throw new Error(
      'This browser tab is not cross-origin isolated (SharedArrayBuffer unavailable). Use Chrome or Edge, close other Builder tabs, and hard-refresh. Disable extensions that strip COOP/COEP headers (Redirect Blocker, privacy shields).',
    );
  }

  // Fail fast when ad/redirect blockers prevent StackBlitz from loading.
  const controller = new AbortController();
  const probeTimer = setTimeout(() => controller.abort(), STACKBLITZ_HEADLESS_PROBE_MS);

  try {
    await fetch('https://stackblitz.com/headless?coep=credentialless&version=1.6.1-internal.1', {
      mode: 'no-cors',
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      'Cannot reach the StackBlitz WebContainer runtime. Disable Redirect Blocker / ad-block extensions for builder.indobase.in, then hard-refresh (Chrome or Edge).',
    );
  } finally {
    clearTimeout(probeTimer);
  }
}

function bootWebContainerOnce(): Promise<WebContainer> {
  return (async () => {
    await assertWebContainerRuntimeReady();

    const boot = WebContainer.boot({
      coep: 'credentialless',
      workdirName: WORK_DIR_NAME,
      forwardPreviewErrors: true,
    });

    return withTimeout(
      boot,
      WEBCONTAINER_BOOT_TIMEOUT_MS,
      'Indobase Builder workspace failed to start (timed out). Disable Redirect Blocker and other extensions for this site, use Chrome or Edge, and hard-refresh.',
    );
  })();
}

async function configureWebContainer(container: WebContainer): Promise<WebContainer> {
  webcontainerContext.loaded = true;

  try {
    await withTimeout(
      (async () => {
        const response = await fetch('/inspector-script.js');

        if (!response.ok) {
          throw new Error(`Failed to load inspector script (${response.status})`);
        }

        const inspectorScript = await response.text();
        await container.setPreviewScript(inspectorScript);
      })(),
      WEBCONTAINER_CONFIGURE_TIMEOUT_MS,
      'Indobase Builder workspace configured too slowly while loading the preview inspector. Hard-refresh and try again.',
    );
  } catch (error) {
    // Preview inspector is optional — do not block the shell/files if it hangs.
    console.warn('WebContainer preview inspector setup skipped:', error);
  }

  container.on('preview-message', (message) => {
    console.log('WebContainer preview message:', message);

    if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
      /*
       * Suppress transient errors thrown while the AI is still writing files — a half-built app
       * throws mid-generation. A persistent error re-fires on the post-generation preview reload
       * (streaming is false by then), so real failures still surface.
       *
       * Import workbench lazily here — never during boot — to avoid a circular
       * webcontainer ↔ workbench import deadlock that leaves the terminal stuck on
       * "Starting Indobase Builder workspace...".
       */
      void (async () => {
        const { streamingState } = await import('~/lib/stores/streaming');

        if (streamingState.get()) {
          return;
        }

        const { workbenchStore } = await import('~/lib/stores/workbench');
        const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
        const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';
        workbenchStore.actionAlert.set({
          type: 'preview',
          title,
          description: 'message' in message ? message.message : 'Unknown error',
          content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
          source: 'preview',
        });
      })().catch((error) => {
        console.warn('Failed to surface WebContainer preview error:', error);
      });
    }
  });

  return container;
}

function bootWebContainer(): Promise<WebContainer> {
  return (async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= WEBCONTAINER_BOOT_MAX_ATTEMPTS; attempt++) {
      try {
        const container = await bootWebContainerOnce();
        // Hard ceiling for post-boot setup so a circular import / hung API cannot
        // leave callers waiting on the shared bootPromise forever.
        return await withTimeout(
          configureWebContainer(container),
          WEBCONTAINER_CONFIGURE_TIMEOUT_MS + 5_000,
          'Indobase Builder workspace setup timed out after boot. Hard-refresh and try again.',
        );
      } catch (error) {
        lastError = error;
        webcontainerContext.loaded = false;
        webcontainerBootErrorAtom.set(
          error instanceof Error ? error.message : 'Indobase Builder workspace failed to start.',
        );

        if (attempt < WEBCONTAINER_BOOT_MAX_ATTEMPTS) {
          console.warn(`WebContainer boot attempt ${attempt} failed, retrying...`, error);
          await sleep(2000 * attempt);
        }
      }
    }

    console.error('WebContainer boot failed:', lastError);
    throw lastError;
  })().then((container) => {
    webcontainerBootErrorAtom.set(null);
    return container;
  });
}

let bootPromise: Promise<WebContainer> | undefined;
/** Coalesce concurrent getWebcontainerWithRetry callers into one retry loop. */
let sharedRetryPromise: Promise<WebContainer> | undefined;

export function resetWebContainerBoot(): void {
  bootPromise = undefined;
  webcontainerContext.loaded = false;

  if (import.meta.hot?.data) {
    import.meta.hot.data.webcontainer = undefined;
  }
}

export function getWebcontainer(): Promise<WebContainer> {
  if (import.meta.env.SSR) {
    return new Promise(() => {
      // noop for ssr
    });
  }

  if (import.meta.hot?.data?.webcontainer) {
    return import.meta.hot.data.webcontainer;
  }

  if (!bootPromise) {
    bootPromise = bootWebContainer();

    if (import.meta.hot?.data) {
      import.meta.hot.data.webcontainer = bootPromise;
    }
  }

  return bootPromise;
}

export async function getWebcontainerWithRetry(maxAttempts = 3): Promise<WebContainer> {
  if (sharedRetryPromise) {
    return sharedRetryPromise;
  }

  sharedRetryPromise = (async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          resetWebContainerBoot();
          await sleep(2000 * attempt);
        }

        return await getWebcontainer();
      } catch (error) {
        lastError = error;
        resetWebContainerBoot();

        if (attempt < maxAttempts) {
          await sleep(1500 * attempt);
        }
      }
    }

    throw lastError;
  })().finally(() => {
    sharedRetryPromise = undefined;
  });

  return sharedRetryPromise;
}

/** Start WebContainer boot as early as possible so the terminal is ready sooner. */
export function warmWebContainer(): void {
  if (import.meta.env.SSR) {
    return;
  }

  void getWebcontainer().catch(() => {
    // Terminal attach will retry; avoid unhandled rejection noise on slow boots.
  });
}

function createLazyPromise(factory: () => Promise<WebContainer>): Promise<WebContainer> {
  let promise: Promise<WebContainer> | undefined;

  const getPromise = () => {
    promise ??= factory();
    return promise;
  };

  return {
    then(onFulfilled, onRejected) {
      return getPromise().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return getPromise().catch(onRejected);
    },
    finally(onFinally) {
      return getPromise().finally(onFinally);
    },
    get [Symbol.toStringTag]() {
      return 'Promise';
    },
  } as Promise<WebContainer>;
}

export let webcontainer: Promise<WebContainer> = import.meta.env.SSR
  ? new Promise(() => {
      // noop for ssr
    })
  : createLazyPromise(getWebcontainer);
