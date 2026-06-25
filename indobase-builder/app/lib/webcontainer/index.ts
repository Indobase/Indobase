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

function bootWebContainer(): Promise<WebContainer> {
  return WebContainer.boot({
    coep: 'credentialless',
    workdirName: WORK_DIR_NAME,
    forwardPreviewErrors: true,
  }).then(async (container) => {
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
  });
}

let bootPromise: Promise<WebContainer> | undefined;

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
