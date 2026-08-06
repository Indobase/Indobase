import path from 'node:path'
import { defineConfig } from 'vitest/config'

/** Lean config so workspace unit tests run without full Remix deps. */
export default defineConfig({
  test: {
    include: ['app/lib/workspace/*.spec.ts'],
    exclude: ['**/._*', '**/node_modules/**'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app'),
      '@indobase/platform': path.resolve(__dirname, '../packages/platform/src/index.ts'),
      '@indobase/cloudflare-adapter': path.resolve(
        __dirname,
        '../packages/cloudflare-adapter/src/index.ts',
      ),
      chalk: path.resolve(__dirname, 'app/lib/workspace/__mocks__/chalk.ts'),
      nanostores: path.resolve(__dirname, 'app/lib/workspace/__mocks__/nanostores.ts'),
    },
  },
})
