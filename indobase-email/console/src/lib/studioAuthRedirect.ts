/** Redirect operators to Indobase Studio sign-in (no public Email password / magic-code UX). */
export function studioSignInUrl(opts?: {
  projectRef?: string | null
}): string {
  const studio =
    (typeof window !== 'undefined' &&
      (window as unknown as { STUDIO_PUBLIC_URL?: string }).STUDIO_PUBLIC_URL) ||
    'https://studio.indobase.in'

  const projectRef =
    opts?.projectRef && opts.projectRef.trim() ? opts.projectRef.trim() : null

  const studioReturnPath = projectRef
    ? `/project/${encodeURIComponent(projectRef)}/marketing`
    : '/organizations'

  return `${String(studio).replace(/\/+$/, '')}/sign-in?returnTo=${encodeURIComponent(studioReturnPath)}`
}

/** Studio marketing hub path where the operator launches Email for a project. */
export function studioMarketingUrl(projectRef?: string | null): string {
  const studio =
    (typeof window !== 'undefined' &&
      (window as unknown as { STUDIO_PUBLIC_URL?: string }).STUDIO_PUBLIC_URL) ||
    'https://studio.indobase.in'
  const base = String(studio).replace(/\/+$/, '')
  const ref = projectRef && projectRef.trim() ? projectRef.trim() : null
  if (ref) {
    // Land on the project page, not /marketing. The Marketing hub route exists but is not
    // surfaced in the product grid, so sending users there dropped them somewhere they had
    // no way to navigate to themselves. The project page is where the Email tile actually is.
    return `${base}/project/${encodeURIComponent(ref)}`
  }
  return `${base}/organizations`
}

export function redirectToStudioSignIn(opts?: {
  projectRef?: string | null
}): void {
  window.location.replace(studioSignInUrl(opts))
}
