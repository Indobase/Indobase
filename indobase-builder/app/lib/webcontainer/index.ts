import { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';
import { isSingletonBootError } from './boot-errors';
import {
  ensureWebContainerApiKeyConfigured,
  resolveWebContainerApiKey,
} from './configure-api-key';

export { isSingletonBootError, shouldSuggestExtensionDisable } from './boot-errors';
export { ensureWebContainerApiKeyConfigured, resolveWebContainerApiKey } from './configure-api-key';

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
const TEARDOWN_SETTLE_MS = 150;

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
  ensureWebContainerApiKeyConfigured();

  if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) {
    throw new Error(
      'This browser tab is not cross-origin isolated (SharedArrayBuffer unavailable). Use Chrome or Edge, close other Builder tabs, and hard-refresh. Disable extensions that strip COOP/COEP headers (Redirect Blocker, privacy shields).',
    );
  }

  /*
   * Fail fast when StackBlitz rejects the host (missing/invalid API key → 404) or when
   * ad/redirect blockers prevent the runtime from loading. Prefer a CORS-aware probe so we
   * can distinguish 404 from opaque network failures (no-cors always "succeeds" on 404).
   */
  const controller = new AbortController();
  const probeTimer = setTimeout(() => controller.abort(), STACKBLITZ_HEADLESS_PROBE_MS);
  const apiKey = resolveWebContainerApiKey();
  const probeUrl = new URL('https://stackblitz.com/headless');
  probeUrl.searchParams.set('coep', 'credentialless');
  probeUrl.searchParams.set('version', '1.6.1-internal.1');

  if (apiKey) {
    probeUrl.searchParams.set('client_id', apiKey);
  }

  try {
    const response = await fetch(probeUrl.toString(), {
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
      signal: controller.signal,
    });

    // Opaque / CORS-blocked responses still mean the network path works; StackBlitz may omit ACAO.
    if (response.type === 'opaque' || response.type === 'opaqueredirect') {
      return;
    }

    if (response.status === 404) {
      throw new Error(
        apiKey
          ? 'StackBlitz rejected this Builder host (headless 404). In the StackBlitz API Console, enable the WebContainer API key and allowlist builder.indobase.in and builder.indobase.fun, then hard-refresh.'
          : 'StackBlitz WebContainer is unavailable on this host without an API key (headless 404). Set WEBCONTAINER_API_KEY on the Builder service and allowlist this domain.',
      );
    }

    if (!response.ok && response.status !== 0) {
      throw new Error(
        `Cannot reach the StackBlitz WebContainer runtime (HTTP ${response.status}). Disable Redirect Blocker / ad-block for builder.indobase.in, then hard-refresh (Chrome or Edge).`,
      );
    }
  } catch (error) {
    if (error instanceof Error && /StackBlitz|WebContainer API key/i.test(error.message)) {
      throw error;
    }

    throw new Error(
      'Cannot reach the StackBlitz WebContainer runtime. Disable Redirect Blocker / ad-block extensions for builder.indobase.in, then hard-refresh (Chrome or Edge).',
    );
  } finally {
    clearTimeout(probeTimer);
  }
}

/** Live instance (or late-arriving boot after a client-side timeout). */
let activeInstance: WebContainer | undefined;
let bootPromise: Promise<WebContainer> | undefined;
/** Serializes boot vs teardown so callers never race a second WebContainer.boot(). */
let bootGate: Promise<void> = Promise.resolve();
/** Coalesce concurrent getWebcontainerWithRetry callers into one retry loop. */
let sharedRetryPromise: Promise<WebContainer> | undefined;
let previewListenerAttached = false;

function rememberInstance(container: WebContainer): WebContainer {
  activeInstance = container;
  return container;
}

async function teardownActiveInstance(): Promise<void> {
  const instance = activeInstance;
  activeInstance = undefined;
  webcontainerContext.loaded = false;
  previewListenerAttached = false;

  if (!instance) {
    return;
  }

  try {
    instance.teardown();
  } catch (error) {
    console.warn('WebContainer teardown failed:', error);
  }

  // Give StackBlitz a beat to clear the process-wide singleton lock.
  await sleep(TEARDOWN_SETTLE_MS);
}

function bootWebContainerOnce(): Promise<WebContainer> {
  return (async () => {
    await assertWebContainerRuntimeReady();

    if (activeInstance) {
      return activeInstance;
    }

    const boot = WebContainer.boot({
      coep: 'credentialless',
      workdirName: WORK_DIR_NAME,
      forwardPreviewErrors: true,
    });

    /*
     * If the client-side timeout rejects first, StackBlitz may still finish booting.
     * Remember that instance so retries can reuse or teardown instead of calling boot() again.
     */
    void boot.then(rememberInstance, () => undefined);

    try {
      const container = await withTimeout(
        boot,
        WEBCONTAINER_BOOT_TIMEOUT_MS,
        'Indobase Builder workspace failed to start (timed out). Hard-refresh the page (Chrome or Edge) or click the terminal reset button (↻) to retry.',
      );
      return rememberInstance(container);
    } catch (error) {
      if (activeInstance) {
        return activeInstance;
      }

      if (isSingletonBootError(error)) {
        throw new Error(
          'Indobase Builder workspace is already running in this tab, but the handle was lost. Click Reset Terminal (↻), or hard-refresh if that fails.',
        );
      }

      throw error;
    }
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

  if (!previewListenerAttached) {
    previewListenerAttached = true;
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
  }

  return container;
}

function bootWebContainer(): Promise<WebContainer> {
  return (async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= WEBCONTAINER_BOOT_MAX_ATTEMPTS; attempt++) {
      try {
        if (activeInstance) {
          return await withTimeout(
            configureWebContainer(activeInstance),
            WEBCONTAINER_CONFIGURE_TIMEOUT_MS + 5_000,
            'Indobase Builder workspace setup timed out after boot. Hard-refresh and try again.',
          );
        }

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

        if (isSingletonBootError(error) && activeInstance) {
          try {
            return await configureWebContainer(activeInstance);
          } catch (configureError) {
            lastError = configureError;
          }
        }

        if (attempt < WEBCONTAINER_BOOT_MAX_ATTEMPTS) {
          console.warn(`WebContainer boot attempt ${attempt} failed, retrying after teardown...`, error);
          await teardownActiveInstance();
          await sleep(2000 * attempt);
        }
      }
    }

    console.error('WebContainer boot failed:', lastError);
    webcontainerBootErrorAtom.set(
      lastError instanceof Error ? lastError.message : 'Indobase Builder workspace failed to start.',
    );
    throw lastError;
  })().then((container) => {
    webcontainerBootErrorAtom.set(null);
    return rememberInstance(container);
  });
}

/**
 * Tear down the live WebContainer (if any) and clear the shared boot promise so the
 * next getWebcontainer() can boot cleanly. Safe to call from Reset Terminal.
 */
export async function resetWebContainerBoot(): Promise<void> {
  let release!: () => void;
  const nextGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previousGate = bootGate;
  bootGate = nextGate;

  try {
    await previousGate;

    const pending = bootPromise;
    bootPromise = undefined;

    if (import.meta.hot?.data) {
      import.meta.hot.data.webcontainer = undefined;
    }

    if (pending) {
      try {
        rememberInstance(await pending);
      } catch {
        // Boot failed; activeInstance may still have been set via the late-resolve side-channel.
      }
    }

    await teardownActiveInstance();
    webcontainerBootErrorAtom.set(null);
  } finally {
    release();
  }
}

export function getWebcontainer(): Promise<WebContainer> {
  if (import.meta.env.SSR) {
    return new Promise(() => {
      // noop for ssr
    });
  }

  if (activeInstance && webcontainerContext.loaded) {
    return Promise.resolve(activeInstance);
  }

  if (import.meta.hot?.data?.webcontainer) {
    return import.meta.hot.data.webcontainer as Promise<WebContainer>;
  }

  if (!bootPromise) {
    const pending = (async () => {
      await bootGate;

      if (activeInstance && webcontainerContext.loaded) {
        return activeInstance;
      }

      if (activeInstance) {
        return configureWebContainer(activeInstance);
      }

      return bootWebContainer();
    })()
      .then((container) => rememberInstance(container))
      .catch((error) => {
        /*
         * Clear the shared slot on failure so a later getWebcontainer() (after reset
         * or when a late-arriving instance was remembered) can try again instead of
         * forever returning this rejected promise.
         */
        if (bootPromise === pending) {
          bootPromise = undefined;
        }

        if (import.meta.hot?.data?.webcontainer === pending) {
          import.meta.hot.data.webcontainer = undefined;
        }

        throw error;
      });

    bootPromise = pending;

    if (import.meta.hot?.data) {
      import.meta.hot.data.webcontainer = pending;
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
          await resetWebContainerBoot();
          await sleep(2000 * attempt);
        }

        return await getWebcontainer();
      } catch (error) {
        lastError = error;

        /*
         * Singleton errors mean an instance already exists — reuse it instead of
         * clearing the promise and calling boot() again.
         */
        if (activeInstance) {
          if (webcontainerContext.loaded) {
            return activeInstance;
          }

          try {
            return await configureWebContainer(activeInstance);
          } catch (configureError) {
            lastError = configureError;
          }
        }

        await resetWebContainerBoot();

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

/**
 * Thenable that always delegates to getWebcontainer() — never caches a rejected
 * promise, so reset + re-boot works for stores that hold this export.
 */
function createLazyPromise(factory: () => Promise<WebContainer>): Promise<WebContainer> {
  return {
    then(onFulfilled, onRejected) {
      return factory().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return factory().catch(onRejected);
    },
    finally(onFinally) {
      return factory().finally(onFinally);
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
