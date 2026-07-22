type ServerEnv = Record<string, string | undefined>;

const ALLOWED_STUDIO_HOST_SUFFIXES = [
  '.indobase.in',
  'studio.indobase.in',
  '.indobase.fun',
  'studio.indobase.fun',
  'localhost',
];

export function isProductionEnv(env?: ServerEnv): boolean {
  const nodeEnv = env?.NODE_ENV ?? process.env.NODE_ENV;
  return nodeEnv === 'production';
}

export function resolveBuilderHandoffSecretForStartup(env?: ServerEnv): string {
  const secret =
    env?.BUILDER_HANDOFF_SECRET?.trim() ||
    process.env.BUILDER_HANDOFF_SECRET?.trim() ||
    '';

  return secret;
}

export function validateProductionEnv(env?: ServerEnv): void {
  if (!isProductionEnv(env)) {
    return;
  }

  if (env?.BUILDER_ALLOW_UNAUTHENTICATED === 'true' || process.env.BUILDER_ALLOW_UNAUTHENTICATED === 'true') {
    throw new Error('BUILDER_ALLOW_UNAUTHENTICATED must not be enabled in production');
  }

  const secret = resolveBuilderHandoffSecretForStartup(env);

  if (secret.length < 32) {
    throw new Error('BUILDER_HANDOFF_SECRET must be set to at least 32 characters in production');
  }
}

export function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function isAllowedStudioOrigin(studioUrl: string): boolean {
  try {
    const { hostname, protocol } = new URL(studioUrl);

    if (protocol !== 'https:' && protocol !== 'http:') {
      return false;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    return ALLOWED_STUDIO_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.replace(/^\./, '') || hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

export function sanitizeProductionErrorMessage(error: unknown, fallback = 'Internal server error'): string {
  if (!isProductionEnv()) {
    return error instanceof Error ? error.stack || error.message : fallback;
  }

  return fallback;
}
