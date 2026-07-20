import posthog from 'posthog-js';

const apiKey = import.meta.env.VITE_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const uiHost = import.meta.env.VITE_POSTHOG_UI_HOST || 'https://us.posthog.com';

let initialized = false;

export function isPostHogConfigured(): boolean {
  return Boolean(apiKey);
}

export function initPostHog(): void {
  if (initialized || import.meta.env.SSR || !apiKey || import.meta.env.DEV) {
    return;
  }

  posthog.init(apiKey, {
    api_host: apiHost,
    ui_host: uiHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  });

  initialized = true;
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
