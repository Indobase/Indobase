import { getUtmSourceForLink } from '$lib/utils/utm';
import { browser } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import { getBuilderUrl } from '$lib/utils/builder';

const DEFAULT_CONSOLE_BASE = 'https://studio.indobase.in';

function normalizeConsoleBase(raw: string): string {
    const trimmed = raw.replace(/\/$/, '');
    try {
        const url = new URL(trimmed);
        const host = url.host;
        const path = url.pathname.replace(/\/$/, '') || '';

        // Studio is the product console — never send CTAs to marketing /dashboard (404).
        if (host === 'studio.indobase.in') {
            return DEFAULT_CONSOLE_BASE;
        }
        if (
            host === 'indobase.in' &&
            (path === '' || path === '/dashboard')
        ) {
            return DEFAULT_CONSOLE_BASE;
        }
    } catch {
        return trimmed;
    }
    return trimmed;
}

const DASHBOARD_BASE = normalizeConsoleBase(
    publicEnv.PUBLIC_APPWRITE_DASHBOARD ||
        publicEnv.PUBLIC_INDOBASE_CONSOLE_URL ||
        DEFAULT_CONSOLE_BASE
);

/** Relative /dashboard only for local vite proxy to Studio. */
function getDashboardBase(): string {
    const isDev = import.meta.env?.DEV === true;
    if (isDev) return '/dashboard';
    if (
        browser &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ) {
        return '/dashboard';
    }
    return DASHBOARD_BASE;
}

export function getAppwriteDashboardUrl(path = ''): string {
    const utmParams = getUtmSourceForLink();
    const base = getDashboardBase();
    const resolvedPath = path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base;
    if (!utmParams) return resolvedPath;
    const separator = resolvedPath.includes('?') ? '&' : '?';
    return `${resolvedPath}${separator}${utmParams}`;
}

/**
 * Sign-up URL — Builder-first (agentic OS). Lands on Builder, not Studio plan wizards.
 *
 * Prefer PUBLIC_BUILDER_URL / classic builder.indobase.in. Campaign `extraParams`
 * (e.g. `{ code: 'sites300' }`) still pass through as query string.
 */
export function getSignUpUrl(extraParams: Record<string, string> = {}): string {
    const base = getBuilderUrl();
    const url = new URL(base);
    for (const [k, v] of Object.entries(extraParams)) {
        if (v != null && String(v).length) url.searchParams.set(k, String(v));
    }
    return url.toString();
}
