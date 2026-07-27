import { parse } from 'tldts';
import { getCookieUrlFromDomain } from '../subdomain/subdomain.management';

/**
 * Cookie Domain for Social session cookies.
 *
 * Default for Indobase Social is host-only (omit Domain) so `auth` is not
 * sent to studio/builder/other `*.indobase.in` apps. Set COOKIE_HOST_ONLY=false
 * to restore upstream parent-domain cookies (`.indobase.in`).
 */
export function getAuthCookieDomain(
  frontendUrl = process.env.FRONTEND_URL || ''
): string | undefined {
  if (
    process.env.COOKIE_HOST_ONLY === 'false' ||
    process.env.COOKIE_HOST_ONLY === '0'
  ) {
    return getCookieUrlFromDomain(frontendUrl);
  }

  // Explicit override (e.g. social.indobase.in)
  if (process.env.COOKIE_DOMAIN?.trim()) {
    return process.env.COOKIE_DOMAIN.trim();
  }

  // Host-only: do not set Domain attribute
  return undefined;
}

export function getAuthCookieOptions(extra: Record<string, unknown> = {}) {
  const domain = getAuthCookieDomain();
  return {
    path: '/',
    ...(domain ? { domain } : {}),
    ...(!process.env.NOT_SECURED
      ? {
          secure: true,
          httpOnly: true,
          // Same-site under social.indobase.in (+ /api) — Lax is enough and
          // safer than None+parent-domain for Studio SSO cookies.
          sameSite: 'lax' as const,
        }
      : {}),
    ...extra,
  };
}

export function studioSignInUrl(opts?: {
  projectRef?: string | null;
  fallbackPath?: string;
}) {
  const studio =
    process.env.STUDIO_PUBLIC_URL?.replace(/\/+$/, '') ||
    process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL?.replace(/\/+$/, '') ||
    'https://studio.indobase.in';
  const projectRef = opts?.projectRef?.trim();
  if (projectRef) {
    const returnPath = `/project/${encodeURIComponent(projectRef)}/marketing`;
    return `${studio}/sign-in?returnTo=${encodeURIComponent(returnPath)}`;
  }
  // Studio validateReturnTo only allows relative Studio paths — never Social URLs.
  // Land on Studio home; operators open Social from Project → Marketing.
  return `${studio}/sign-in?returnTo=${encodeURIComponent(opts?.fallbackPath || '/')}`;
}

export function frontendHostname(frontendUrl = process.env.FRONTEND_URL || '') {
  try {
    return new URL(frontendUrl).hostname;
  } catch {
    return parse(frontendUrl).hostname || '';
  }
}
