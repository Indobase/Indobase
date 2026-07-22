import { browser } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';

const DEFAULT_BUILDER_BASE = 'https://builder.indobase.in';

function getBuilderBase(): string {
    const fromEnv = publicEnv.PUBLIC_BUILDER_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');

    if (browser) {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://localhost:5174';
        }
    }

    return DEFAULT_BUILDER_BASE;
}

/** Deep-link into Builder with an optional starter prompt. */
export function getBuilderUrl(options: { prompt?: string; autostart?: boolean } = {}): string {
    const base = getBuilderBase();
    const url = new URL('/', base);

    const prompt = options.prompt?.trim();
    if (prompt) {
        url.searchParams.set('prompt', prompt);
    }

    if (options.autostart && prompt) {
        url.searchParams.set('autostart', '1');
    }

    return url.toString();
}
