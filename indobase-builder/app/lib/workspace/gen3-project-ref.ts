/**
 * Resolve the Indobase project ref for Gen 3 Commands envelopes.
 * Offline / unlinked Builder sessions use a stable local sentinel (never Cloudflare naming).
 */

export const GEN3_LOCAL_PROJECT_REF = 'builder-local';

/**
 * @param explicit - caller override (tests / API)
 * @param fallback - optional live lookup (Studio handoff / selected project)
 */
export function resolveGen3ProjectRef(
  explicit?: string,
  fallback?: () => string | undefined,
): string {
  const trimmed = explicit?.trim();

  if (trimmed) {
    return trimmed;
  }

  try {
    const fromFallback = fallback?.()?.trim();

    if (fromFallback) {
      return fromFallback;
    }
  } catch {
    // Fallback may touch browser stores unavailable in unit tests.
  }

  return GEN3_LOCAL_PROJECT_REF;
}
