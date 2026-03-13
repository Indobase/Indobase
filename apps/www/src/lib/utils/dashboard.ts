import { getUtmSourceForLink } from '$lib/utils/utm';
import { browser } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';

const DEFAULT_CONSOLE_BASE = 'https://indobase.fun/dashboard';

function normalizeConsoleBase(raw: string): string {
    const trimmed = raw.replace(/\/$/, '');
    try {
        const url = new URL(trimmed);
        const host = url.host;
        const path = url.pathname;
        if (host === 'studio.indobase.fun') {
            return 'https://indobase.fun/dashboard';
        }
        if (host === 'indobase.fun' && path === '') {
            return 'https://indobase.fun/dashboard';
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

export function getAppwriteDashboardUrl(path = ''): string {
    const utmParams = getUtmSourceForLink();
    const isDev = import.meta.env?.DEV === true;
    const base = isDev
        ? '/dashboard'
        : browser &&
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? '/dashboard'
          : DASHBOARD_BASE;
    const resolvedPath = path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base;
    if (!utmParams) return resolvedPath;
    const separator = resolvedPath.includes('?') ? '&' : '?';
    return `${resolvedPath}${separator}${utmParams}`;
}
