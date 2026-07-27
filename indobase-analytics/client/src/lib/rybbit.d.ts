/**
 * Browser tracking API for Indobase Analytics (`window.indobase`).
 * The interface name `Rybbit` is retained only for TypeScript compatibility
 * with upstream types; prefer referring to it as IndobaseAnalytics in docs.
 */
interface IndobaseAnalytics {
  /**
   * Tracks a page view
   */
  pageview: () => void;

  /**
   * Tracks a custom event
   * @param name Name of the event
   * @param properties Optional properties for the event
   */
  event: (name: string, properties?: Record<string, any>) => void;

  /**
   * Sets a custom user ID for tracking logged-in users
   * @param userId The user ID to set (will be stored in localStorage)
   * @param traits Optional user metadata (email, name, custom fields)
   */
  identify: (userId: string, traits?: Record<string, unknown>) => void;

  /**
   * Updates traits for the currently identified user
   * @param traits User metadata to merge with existing traits
   */
  setTraits: (traits: Record<string, unknown>) => void;

  /**
   * Clears the stored user ID
   */
  clearUserId: () => void;

  /**
   * Gets the currently set user ID
   * @returns The current user ID or null if not set
   */
  getUserId: () => string | null;

  /**
   * Manually tracks outbound link clicks
   * @param url The URL of the outbound link
   * @param text Optional text content of the link
   * @param target Optional target attribute of the link
   */
  trackOutbound: (url: string, text?: string, target?: string) => void;

  /**
   * Evaluates a feature flag and returns its value. Reading a flag records a
   * feature flag exposure once per flag value/version.
   * @param key The flag key
   * @param fallback Value returned before flags resolve or if the flag is inactive
   */
  flag: <T = unknown>(key: string, fallback?: T) => T;

  /**
   * Returns the payload for a feature flag or its selected variant.
   * Use this for remote config and multivariate payloads.
   * @param key The flag key
   * @param fallback Value returned before flags resolve or if the flag is inactive
   */
  flagPayload: <T = unknown>(key: string, fallback?: T) => T;

  /**
   * Returns all evaluated flag values keyed by flag key
   */
  flags: () => Record<string, unknown>;

  /**
   * Returns all available flag payloads keyed by flag key
   */
  flagPayloads: () => Record<string, unknown>;

  /**
   * Runs a callback once the tracking script and feature flags are ready.
   * Use this before reading flags during page initialization.
   * @param callback Receives the ready analytics instance (`window.indobase`;
   *   `window.rybbit` may also be present as a legacy compatibility alias)
   */
  onReady: (callback: (api: IndobaseAnalytics) => void) => void;
}

/** @deprecated Prefer `IndobaseAnalytics`. Kept as a type alias for legacy call sites. */
type Rybbit = IndobaseAnalytics;

declare global {
  interface Window {
    /** Primary Indobase Analytics tracking API. */
    indobase: IndobaseAnalytics;
    /**
     * Legacy compatibility alias for the same tracking API as `window.indobase`.
     * Prefer `window.indobase` in new code and docs.
     */
    rybbit: IndobaseAnalytics;
  }
}

export {};
