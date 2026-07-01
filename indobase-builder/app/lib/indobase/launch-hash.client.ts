/** Read handoff JWT from URL hash (not sent to server — avoids HTTP 431). */
export function readHandoffTokenFromLocation(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, '').trim();

  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  return params.get('token')?.trim() || params.get('handoff')?.trim() || null;
}

export function clearHandoffTokenFromLocation() {
  if (typeof window === 'undefined' || !window.location.hash) {
    return;
  }

  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState({}, '', url.pathname + url.search);
}
