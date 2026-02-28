import { getUtmSourceForLink } from '$lib/utils/utm';
import { env as publicEnv } from '$env/dynamic/public';

/** Studio / Console URL (Indobase dashboard). Same domain: indobase.fun/dashboard. Use localhost for local dev. */
const DEFAULT_CONSOLE_BASE = 'https://indobase.fun/dashboard';
const DASHBOARD_BASE = (publicEnv.PUBLIC_APPWRITE_DASHBOARD || publicEnv.PUBLIC_INDOBASE_CONSOLE_URL || DEFAULT_CONSOLE_BASE).replace(/\/$/, '');

export function getAppwriteDashboardUrl(path = ''): string {
    const utmParams = getUtmSourceForLink();

    const base = DASHBOARD_BASE;

    const resolvedPath = path
        ? `${base}${path.startsWith('/') ? path : `/${path}`}`
        : base;

    if (!utmParams) {
        return resolvedPath;
    }

    const separator = resolvedPath.includes('?') ? '&' : '?';
    return `${resolvedPath}${separator}${utmParams}`;
}
