import { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';
import { isSingletonBootError, toUserFacingBootError } from './boot-errors';
import { ensureWebContainerApiKeyConfigured } from './configure-api-key';
import { whenBuilderPublicEnvReady } from './public-env';

export {
  isFatalBootConfigError,
  isSingletonBootError,
  shouldSuggestExtensionDisable,
  toUserFacingBootError,
} from './boot-errors';
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
const WEBCONTAINER_CONFIGURE_TIMEOUT_MS = 25_000;
/**
 * One attempt only. Retries call WebContainer.boot() again after teardown and thrash StackBlitz
 * when the runtime is blocked by network/extensions/outage. Reset Terminal clears the latch.
 */
const WEBCONTAINER_BOOT_MAX_ATTEMPTS = 1;
const TEARDOWN_SETTLE_MS = 250;

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
  await whenBuilderPublicEnvReady();
  ensureWebContainerApiKeyConfigured();

  if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) {
    throw new Error(
      'This browser tab is not cross-origin isolated (SharedArrayBuffer unavailable). Use Chrome or Edge, close other Builder tabs, and hard-refresh. Disable extensions that strip COOP/COEP headers (Redirect Blocker, privacy shields).',
    );
  }

  /*
   * Do NOT probe https://stackblitz.com/headless with fetch(). That URL is loaded by the SDK as a
   * worker/iframe, not CORS for arbitrary origins. A prior advisory probe used
   * mode:"no-cors" + redirect:"manual", which Chrome rejects with:
   *   Fetch API cannot load … Request mode is "no-cors" but the redirect mode is not "follow".
   * WebContainer.boot() is the only authority on whether the runtime works.
   */
}

/** Live instance (or late-arriving boot after a client-side timeout). */
let activeInstance: WebContainer | undefined;
let bootPromise: Promise<WebContainer> | undefined;
/**
 * Latches after an exhausted boot so file writes / warm boots / ActionRunner cannot re-enter the
 * full StackBlitz boot loop. Reset Terminal clears it.
 */
let bootFailureLatch: Error | undefined;
/** Coalesce concurrent getWebcontainerWithRetry callers into one retry loop. */
let sharedRetryPromise: Promise<WebContainer> | undefined;
let previewListenerAttached = false;
/** Serializes boot vs teardown so callers never race a second WebContainer.boot(). */
let bootGate: Promise<void> = Promise.resolve();

function rememberInstance(container: WebContainer): WebContainer {
  activeInstance = container;
  return container;
}

function latchBootFailure(error: unknown): Error {
  const message = toUserFacingBootError(error);
  const latched = error instanceof Error ? Object.assign(error, { message }) : new Error(message);
  bootFailureLatch = latched;
  webcontainerBootErrorAtom.set(message);
  return latched;
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

    void boot.then(rememberInstance, () => undefined);

    try {
      const container = await withTimeout(
        boot,
        WEBCONTAINER_BOOT_TIMEOUT_MS,
        'Indobase Builder workspace failed to start (timed out). Preview will use the server draft build instead. Click Reset Terminal (↻) to retry WebContainer, or hard-refresh (Chrome/Edge).',
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
    console.warn('WebContainer preview inspector setup skipped:', error);
  }

  if (!previewListenerAttached) {
    previewListenerAttached = true;
    container.on('preview-message', (message) => {
      console.log('WebContainer preview message:', message);

      if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
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
    throw latchBootFailure(lastError);
  })().then((container) => {
    bootFailureLatch = undefined;
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
    bootFailureLatch = undefined;

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

/** True when boot already failed this session (until Reset Terminal). */
export function hasWebContainerBootFailed(): boolean {
  return !!bootFailureLatch || !!webcontainerBootErrorAtom.get();
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

  if (bootFailureLatch) {
    return Promise.reject(bootFailureLatch);
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

      if (bootFailureLatch) {
        throw bootFailureLatch;
      }

      if (activeInstance) {
        return configureWebContainer(activeInstance);
      }

      return bootWebContainer();
    })()
      .then((container) => rememberInstance(container))
      .catch((error) => {
        if (bootPromise === pending) {
          bootPromise = undefined;
        }

        if (import.meta.hot?.data?.webcontainer === pending) {
          import.meta.hot.data.webcontainer = undefined;
        }

        if (!bootFailureLatch) {
          latchBootFailure(error);
        }

        throw bootFailureLatch || error;
      });

    bootPromise = pending;

    if (import.meta.hot?.data) {
      import.meta.hot.data.webcontainer = pending;
    }
  }

  return bootPromise;
}

export async function getWebcontainerWithRetry(maxAttempts = 1): Promise<WebContainer> {
  if (bootFailureLatch) {
    return Promise.reject(bootFailureLatch);
  }

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

        if (attempt < maxAttempts) {
          await resetWebContainerBoot();
          await sleep(1500 * attempt);
        }
      }
    }

    throw latchBootFailure(lastError);
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

  if (bootFailureLatch) {
    return;
  }

  void getWebcontainer().catch(() => {
    // Terminal attach will surface the latched error; avoid unhandled rejection noise.
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
