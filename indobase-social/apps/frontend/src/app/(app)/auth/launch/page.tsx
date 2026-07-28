'use client';

import { useEffect, useRef } from 'react';
import { resolveStudioPublicUrlFromBrowser } from '@gitroom/helpers/utils/studio-public-url';

/**
 * Studio → Indobase Social SSO entry.
 * Reads the short-lived handoff JWT from the URL fragment and exchanges it via
 * `GET /auth/studio-handoff` (sets session cookies, redirects home).
 */
export default function LaunchPage() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const projectRef = searchParams.get('project_ref');

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token =
      hashParams.get('token') ||
      hashParams.get('handoff') ||
      searchParams.get('token') ||
      searchParams.get('handoff');

    const studio = resolveStudioPublicUrlFromBrowser();

    if (!token) {
      const returnPath = projectRef
        ? `/project/${encodeURIComponent(projectRef)}/marketing`
        : '/';
      window.location.replace(
        `${studio}/sign-in?returnTo=${encodeURIComponent(returnPath)}`
      );
      return;
    }

    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = '';
    cleanUrl.searchParams.delete('token');
    cleanUrl.searchParams.delete('handoff');
    window.history.replaceState({}, '', cleanUrl.toString());

    const exchange = new URL('/api/auth/studio-handoff', window.location.origin);
    // Backend is under /api via nginx; Nest controller is /auth/studio-handoff
    // Public path through Indobase Social nginx is typically /api → backend.
    exchange.searchParams.set('token', token);
    window.location.replace(exchange.toString());
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0E0E0E] text-white">
      <p className="text-sm opacity-80">Opening Indobase Social…</p>
    </div>
  );
}
