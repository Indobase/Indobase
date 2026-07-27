'use client';

import { useEffect, useRef } from 'react';

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

    const studio =
      process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL?.replace(/\/+$/, '') ||
      'https://studio.indobase.in';

    if (!token) {
      if (projectRef) {
        const returnPath = `/project/${encodeURIComponent(projectRef)}/marketing`;
        window.location.replace(
          `${studio}/sign-in?returnTo=${encodeURIComponent(returnPath)}`
        );
      } else {
        // No handoff token and no project — show Social SSO landing (not Studio /).
        window.location.replace('/auth');
      }
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
