import { browser } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import posthog from 'posthog-js';

import { ENV } from '$lib/system';

const apiKey = publicEnv.PUBLIC_POSTHOG_API_KEY;
const apiHost = publicEnv.PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const uiHost = publicEnv.PUBLIC_POSTHOG_UI_HOST ?? 'https://us.posthog.com';

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
    if (!browser || initialized || !apiKey || ENV.DEV || ENV.PREVIEW || ENV.TEST) {
        return;
    }

    posthog.init(apiKey, {
        api_host: apiHost,
        ui_host: uiHost,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: true,
        capture_exceptions: POSTHOG_CAPTURE_EXCEPTIONS,
        persistence: 'localStorage+cookie'
    });

    initialized = true;
}

export function capturePostHogPageview(pathname?: string): void {
    if (!browser || !initialized) return;

    posthog.capture('$pageview', {
        $current_url: window.location.href,
        $pathname: pathname ?? window.location.pathname,
        page_title: document.title
    });
}

export function capturePostHogEvent(name: string, properties?: Record<string, unknown>): void {
    if (!browser || !initialized) return;

    posthog.capture(name, properties);
}

export function capturePostHogException(
    error: unknown,
    properties?: Record<string, unknown>
): void {
    if (!browser || !initialized) return;

    const normalizedError = error instanceof Error ? error : new Error(String(error));
    posthog.captureException(normalizedError, properties);
}
