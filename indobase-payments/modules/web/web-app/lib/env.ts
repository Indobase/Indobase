import { parseEnv } from '@md/common'
import { z } from 'zod/v3'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const window = globalThis as any

if (!window._env) {
  window._env = import.meta.env
}

const _env = parseEnv(window._env, {
  VITE_METEROID_API_EXTERNAL_URL: z.string().default('http://127.0.0.1:50061'),
  VITE_METEROID_REST_API_EXTERNAL_URL: z.string().default('http://127.0.0.1:8080'),
  VITE_STUDIO_URL: z.string().default('https://studio.indobase.in'),
  // enable developer experience mode
  VITE_DX: z.boolean().default(false),
  // todo move to feature flag service
  VITE_ENTITLEMENTS_ENABLED: z.boolean().default(false),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_SENTRY_ENVIRONMENT: z.string().optional(),
})

export const env = {
  meteroidApiUri: _env.VITE_METEROID_API_EXTERNAL_URL,
  meteroidRestApiUri: _env.VITE_METEROID_REST_API_EXTERNAL_URL,
  studioUrl: _env.VITE_STUDIO_URL,
  dx: _env.VITE_DX,
  entitlementsEnabled: _env.VITE_ENTITLEMENTS_ENABLED,
  sentryDsn: (_env.VITE_SENTRY_DSN || '').trim(),
  sentryEnvironment: (_env.VITE_SENTRY_ENVIRONMENT || '').trim() || 'production',
}
