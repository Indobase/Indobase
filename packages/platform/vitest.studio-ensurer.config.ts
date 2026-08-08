/**
 * Run Lane 2 ensurer unit tests without a full studio install.
 *
 *   cd packages/platform && ./node_modules/.bin/vitest run --config vitest.studio-ensurer.config.ts
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const studioRoot = resolve(__dirname, '../../apps/studio')

export default defineConfig({
  root: studioRoot,
  resolve: {
    alias: {
      '@indobase/platform': resolve(__dirname, './src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'lib/api/saas/os-ensurer.test.ts',
      'lib/api/saas/os-identity.test.ts',
      'lib/api/saas/os-business-configure.test.ts',
      'lib/api/saas/os-product-auth-mail.test.ts',
    ],
  },
})
