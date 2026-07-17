import { isAllowedStudioOrigin, normalizeOrigin } from '~/lib/production.server';

type ServerEnv = Record<string, string | undefined>;

/**
 * Resolve the base URL Builder server code should use when calling Studio.
 *
 * Public `studio.indobase.in` DNS from Swarm containers is intermittently
 * `EAI_AGAIN`. Prefer `STUDIO_INTERNAL_URL` (Docker/Swarm service DNS) for
 * server-side fetches while still validating the JWT's public studio origin.
 */
export function resolveStudioServerFetchBase(
  publicStudioUrl: string,
  env?: ServerEnv,
): string | null {
  const publicOrigin = normalizeOrigin(publicStudioUrl);

  if (!isAllowedStudioOrigin(publicOrigin)) {
    return null;
  }

  const internal =
    env?.STUDIO_INTERNAL_URL?.trim() ||
    env?.INDOBASE_STUDIO_INTERNAL_URL?.trim() ||
    process.env.STUDIO_INTERNAL_URL?.trim() ||
    process.env.INDOBASE_STUDIO_INTERNAL_URL?.trim() ||
    '';

  if (internal) {
    return normalizeOrigin(internal);
  }

  return publicOrigin;
}
