import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Lightweight vitest config for OS SaaS unit tests without Studio's full Next/React setup.
 * Usage (from repo root):
 *   packages/agent-runtime/node_modules/.bin/vitest run --config apps/studio/vitest.os-saas.config.ts
 */
export default defineConfig({
  resolve: {
    alias: {
      '@indobase/platform': resolve(__dirname, '../../packages/platform/src/index.ts'),
      '@indobase/agent-runtime': resolve(__dirname, '../../packages/agent-runtime/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/api/saas/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/._*', '.next/**'],
  },
})
