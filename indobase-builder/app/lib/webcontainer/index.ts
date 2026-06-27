import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

const WEBCONTAINER_BOOT_TIMEOUT_MS = 120_000;
const WEBCONTAINER_BOOT_MAX_ATTEMPTS = 2;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bootWebContainerOnce(): Promise<WebContainer> {
  const boot = WebContainer.boot({
    coep: 'credentialless',
    workdirName: WORK_DIR_NAME,
    forwardPreviewErrors: true,
  });

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          'Indobase Builder workspace failed to start (timed out). Use Chrome or Edge, disable extensions that block SharedArrayBuffer, and hard-refresh the page.',
        ),
      );
    }, WEBCONTAINER_BOOT_TIMEOUT_MS);
  });

  return Promise.race([boot, timeout]);
}

async function configureWebContainer(container: WebContainer): Promise<WebContainer> {
  webcontainerContext.loaded = true;

  const { workbenchStore } = await import('~/lib/stores/workbench');

  const response = await fetch('/inspector-script.js');
  const inspectorScript = await response.text();
  await container.setPreviewScript(inspectorScript);

  container.on('preview-message', (message) => {
    console.log('WebContainer preview message:', message);

    if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
      const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
      const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';
      workbenchStore.actionAlert.set({
        type: 'preview',
        title,
        description: 'message' in message ? message.message : 'Unknown error',
        content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
        source: 'preview',
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
        return await configureWebContainer(container);
      } catch (error) {
        lastError = error;
        webcontainerContext.loaded = false;

        if (attempt < WEBCONTAINER_BOOT_MAX_ATTEMPTS) {
          console.warn(`WebContainer boot attempt ${attempt} failed, retrying...`, error);
          await sleep(2000 * attempt);
        }
      }
    }

    console.error('WebContainer boot failed:', lastError);
    throw lastError;
  })().catch((error) => {
    resetWebContainerBoot();
    throw error;
  });
}

let bootPromise: Promise<WebContainer> | undefined;

export function resetWebContainerBoot(): void {
  bootPromise = undefined;
  webcontainerContext.loaded = false;

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = undefined;
  }
}

export function getWebcontainer(): Promise<WebContainer> {
  if (import.meta.env.SSR) {
    return new Promise(() => {
      // noop for ssr
    });
  }

  if (import.meta.hot?.data.webcontainer) {
    return import.meta.hot.data.webcontainer;
  }

  if (!bootPromise) {
    bootPromise = bootWebContainer();

    if (import.meta.hot) {
      import.meta.hot.data.webcontainer = bootPromise;
    }
  }

  return bootPromise;
}

export async function getWebcontainerWithRetry(maxAttempts = 3): Promise<WebContainer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getWebcontainer();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        resetWebContainerBoot();
        await sleep(1500 * attempt);
      }
    }
  }

  throw lastError;
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
