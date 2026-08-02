'use client';

import { useMemo } from 'react';

export function StudioSsoLanding({ projectRef }: { projectRef?: string }) {
  const studioHref = useMemo(() => {
    const studio =
      process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL?.replace(/\/+$/, '') ||
      'https://studio.indobase.in';
    if (projectRef?.trim()) {
      const returnPath = `/project/${encodeURIComponent(projectRef.trim())}/marketing`;
      return `${studio}/sign-in?returnTo=${encodeURIComponent(returnPath)}`;
    }
    return `${studio}/sign-in?returnTo=${encodeURIComponent('/')}`;
  }, [projectRef]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 px-6 text-center text-white">
      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Indobase Social</h1>
        <p className="text-sm opacity-80 leading-relaxed">
          Sign in with your Indobase Studio account. Open Social from a project&apos;s
          Marketing page for the fastest handoff, or continue to Studio below.
        </p>
      </div>
      <a
        href={studioHref}
        className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium text-white"
        style={{ backgroundColor: '#3B8FD6' }}
      >
        Continue with Indobase Studio
      </a>
      <p className="text-xs opacity-60 max-w-sm">
        Studio → Project → Marketing → Social. No separate Social password.
      </p>
    </div>
  );
}
