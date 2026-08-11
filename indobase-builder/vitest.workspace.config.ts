import path from 'node:path'
import { defineConfig } from 'vitest/config'

/** Lean config so workspace unit tests run without full Remix deps. */
export default defineConfig({
  test: {
    include: [
      'app/lib/workspace/*.spec.ts',
      'app/lib/indobase/stock-images/**/*.spec.ts',
      'app/lib/indobase/visual-quality-lint.spec.ts',
      'app/lib/indobase/deployEnv.spec.ts',
      'app/lib/indobase/connection.spec.ts',
      'app/lib/pocketbase/**/*.spec.ts',
      'app/lib/pocketbase/managed.server.spec.ts',
      'app/lib/common/prompts/design-instructions.test.ts',
    ],
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
