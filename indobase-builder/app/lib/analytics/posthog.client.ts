import posthog from 'posthog-js';

const apiKey = import.meta.env.VITE_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const uiHost = import.meta.env.VITE_POSTHOG_UI_HOST || 'https://us.posthog.com';

const POSTHOG_CAPTURE_EXCEPTIONS = {
  capture_unhandled_errors: true,
  capture_unhandled_rejections: true,
  capture_console_errors: false,
} as const;

let initialized = false;

export function isPostHogConfigured(): boolean {
  return Boolean(apiKey);
}

export function initPostHog(): void {
  if (initialized || import.meta.env.SSR || !apiKey || import.meta.env.DEV) {
    return;
  }

  try {
    posthog.init(apiKey, {
      api_host: apiHost,
      ui_host: uiHost,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      capture_exceptions: POSTHOG_CAPTURE_EXCEPTIONS,
      persistence: 'localStorage+cookie',
    });

    initialized = true;
  } catch (error) {
    console.warn('[posthog] init failed (non-fatal)', error);
  }
}

export function capturePostHogPageview(pathname?: string): void {
  if (!initialized || import.meta.env.SSR) return;

  posthog.capture('$pageview', {
    $current_url: window.location.href,
    $pathname: pathname ?? window.location.pathname,
    page_title: document.title,
    app: 'indobase-builder',
  });
}

export function capturePostHogEvent(name: string, properties?: Record<string, unknown>): void {
  if (!initialized || import.meta.env.SSR) return;

  posthog.capture(name, {
    app: 'indobase-builder',
    ...properties,
  });
}

export function capturePostHogException(
  error: unknown,
  properties?: Record<string, unknown>
): void {
  if (!initialized || import.meta.env.SSR) return;

  const normalizedError = error instanceof Error ? error : new Error(String(error));
  posthog.captureException(normalizedError, {
    app: 'indobase-builder',
    ...properties,
  });
}
