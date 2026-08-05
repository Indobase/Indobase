/**
 * Browser bootstrap for StackBlitz WebContainer client key + other public runtime values.
 *
 * Production hosts require the key before any `getWebcontainer()` call. Health checks only prove
 * the *server* has WEBCONTAINER_API_KEY; the browser must receive it via:
 *   1. Sync inline bootstrap (Layout head) — preferred, available before route modules run
 *   2. Async `/api/runtime-public-env` fetch (root useEffect) — refresh / fallback
 */

declare global {
  interface Window {
    __INDOBASE_BUILDER_PUBLIC__?: {
      webcontainerApiKey?: string;
      sentryDsn?: string;
      /** false when StackBlitz /headless rejects this Builder host (allowlist missing). */
      webcontainerHeadlessOk?: boolean;
    };
  }
}

type BuilderPublicEnv = {
  webcontainerApiKey: string;
  sentryDsn: string;
  webcontainerHeadlessOk?: boolean;
};

let resolveReady!: () => void;
let readySettled = false;

const readyPromise = new Promise<void>((resolve) => {
  resolveReady = () => {
    if (readySettled) {
      return;
    }

    readySettled = true;
    resolve();
  };
});

function readWindowEnv(): BuilderPublicEnv {
  const fromWindow = typeof window !== 'undefined' ? window.__INDOBASE_BUILDER_PUBLIC__ : undefined;

  const headlessOk = fromWindow?.webcontainerHeadlessOk;

  return {
    webcontainerApiKey: fromWindow?.webcontainerApiKey?.trim() || '',
    sentryDsn: fromWindow?.sentryDsn?.trim() || '',
    ...(headlessOk === undefined ? {} : { webcontainerHeadlessOk: headlessOk }),
  };
}

export function applyBuilderPublicEnv(partial: {
  webcontainerApiKey?: string;
  sentryDsn?: string;
  webcontainerHeadlessOk?: boolean;
}): BuilderPublicEnv {
  if (typeof window === 'undefined') {
    return { webcontainerApiKey: '', sentryDsn: '' };
  }

  const next = {
    ...(window.__INDOBASE_BUILDER_PUBLIC__ || {}),
    ...(partial.webcontainerApiKey !== undefined
      ? { webcontainerApiKey: partial.webcontainerApiKey.trim() }
      : {}),
    ...(partial.sentryDsn !== undefined ? { sentryDsn: partial.sentryDsn.trim() } : {}),
    ...(partial.webcontainerHeadlessOk !== undefined
      ? { webcontainerHeadlessOk: partial.webcontainerHeadlessOk }
      : {}),
  };

  window.__INDOBASE_BUILDER_PUBLIC__ = next;

  if (next.webcontainerApiKey?.trim()) {
    resolveReady();
  }

  const headlessOk = next.webcontainerHeadlessOk;

  return {
    webcontainerApiKey: next.webcontainerApiKey?.trim() || '',
    sentryDsn: next.sentryDsn?.trim() || '',
    ...(headlessOk === undefined ? {} : { webcontainerHeadlessOk: headlessOk }),
  };
}

/** Mark public-env bootstrap finished even when the key is empty (local hosts). */
export function markBuilderPublicEnvReady(): void {
  resolveReady();
}

export function getBuilderPublicEnv(): BuilderPublicEnv {
  return readWindowEnv();
}

/**
 * Wait until sync/async bootstrap has had a chance to populate the window key.
 * Always resolves (never rejects) so boot can proceed to a clear missing-key error.
 */
export function whenBuilderPublicEnvReady(timeoutMs = 8_000): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (readWindowEnv().webcontainerApiKey || readySettled) {
    return Promise.resolve();
  }

  // Sync bootstrap in <head> may have already set the key before modules evaluated.
  if (window.__INDOBASE_BUILDER_PUBLIC__?.webcontainerApiKey?.trim()) {
    resolveReady();
    return Promise.resolve();
  }

  return Promise.race([
    readyPromise,
    new Promise<void>((resolve) => {
      setTimeout(() => {
        markBuilderPublicEnvReady();
        resolve();
      }, timeoutMs);
    }),
  ]);
}

export async function fetchBuilderPublicEnv(): Promise<BuilderPublicEnv> {
  try {
    const response = await fetch('/api/runtime-public-env', { credentials: 'same-origin' });

    if (!response.ok) {
      markBuilderPublicEnvReady();
      return readWindowEnv();
    }

    const data = (await response.json()) as {
      webcontainerApiKey?: string;
      sentryDsn?: string;
      webcontainerHeadlessOk?: boolean;
    };
    const applied = applyBuilderPublicEnv({
      webcontainerApiKey: data.webcontainerApiKey || '',
      sentryDsn: data.sentryDsn || '',
      ...(data.webcontainerHeadlessOk === undefined
        ? {}
        : { webcontainerHeadlessOk: data.webcontainerHeadlessOk }),
    });
    markBuilderPublicEnvReady();

    return applied;
  } catch (error) {
    console.warn('Failed to load Builder public runtime env', error);
    markBuilderPublicEnvReady();

    return readWindowEnv();
  }
}

/**
 * Inline <head> script: synchronous XHR so the WebContainer key exists before route modules
 * (FilesStore idle boot) call getWebcontainer(). Mirrors Studio `_document.tsx` bootstrap.
 */
export const BUILDER_PUBLIC_ENV_SYNC_BOOTSTRAP = `(function(){try{if(typeof window==='undefined')return;var x=new XMLHttpRequest();x.open('GET','/api/runtime-public-env',false);x.withCredentials=true;x.send(null);if(x.status===200){var j=JSON.parse(x.responseText);window.__INDOBASE_BUILDER_PUBLIC__=Object.assign(window.__INDOBASE_BUILDER_PUBLIC__||{},{webcontainerApiKey:(j.webcontainerApiKey||'').trim(),sentryDsn:(j.sentryDsn||'').trim(),webcontainerHeadlessOk:j.webcontainerHeadlessOk});}}catch(e){}})();`;
