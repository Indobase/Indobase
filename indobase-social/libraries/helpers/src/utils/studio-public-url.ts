const DEFAULT_STUDIO_PROD = 'https://studio.indobase.in';
const DEFAULT_STUDIO_STAGING = 'https://studio.indobase.fun';

function normalizeStudioBase(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/\/+$/, '');
  return trimmed || undefined;
}

/** Map Social host to the matching Studio origin when env is shared across .in and .fun. */
export function resolveStudioPublicUrl(requestHost?: string | null): string {
  const configured =
    normalizeStudioBase(process.env.STUDIO_PUBLIC_URL) ??
    normalizeStudioBase(process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL);

  if (requestHost) {
    const host = requestHost.split(':')[0]?.toLowerCase() ?? '';
    if (host.endsWith('.indobase.fun')) {
      return DEFAULT_STUDIO_STAGING;
    }
    if (host.endsWith('.indobase.in')) {
      return configured ?? DEFAULT_STUDIO_PROD;
    }
  }

  return configured ?? DEFAULT_STUDIO_PROD;
}

export function resolveStudioPublicUrlFromBrowser(): string {
  if (typeof window !== 'undefined') {
    return resolveStudioPublicUrl(window.location.host);
  }

  return (
    normalizeStudioBase(process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL) ?? DEFAULT_STUDIO_PROD
  );
}
