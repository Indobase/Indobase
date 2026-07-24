/** Redirect operators to Indobase Studio sign-in (no public Email password / magic-code UX). */
export function studioSignInUrl(opts?: {
  projectRef?: string | null
  returnPath?: string | null
}): string {
  const studio =
    (typeof window !== 'undefined' &&
      (window as unknown as { STUDIO_PUBLIC_URL?: string }).STUDIO_PUBLIC_URL) ||
    'https://studio.indobase.in'
  const returnPath =
    opts?.returnPath && opts.returnPath.startsWith('/')
      ? opts.returnPath
      : opts?.projectRef
        ? `/project/${encodeURIComponent(opts.projectRef)}/marketing`
        : '/'
  return `${String(studio).replace(/\/+$/, '')}/sign-in?returnTo=${encodeURIComponent(returnPath)}`
}

export function redirectToStudioSignIn(opts?: {
  projectRef?: string | null
  returnPath?: string | null
}): void {
  window.location.replace(studioSignInUrl(opts))
}
