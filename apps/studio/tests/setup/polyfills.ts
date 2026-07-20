import { ReadableStream, TransformStream } from 'node:stream/web'
import { TextDecoder, TextEncoder } from 'node:util'
import { act } from '@testing-library/react'
import { configMocks } from 'jsdom-testing-mocks'
import { vi } from 'vitest'

configMocks({ act })

/*
 * setupFiles run for EVERY test, including files that opt into `@vitest-environment node`, where
 * there is no `window`. Touching it unguarded threw before any test could load, so those files
 * reported "no tests" and silently never ran — which is how a stale assertion in plan-badge.test.ts
 * went unnoticed. DOM-only setup below is skipped outside a DOM environment.
 */
if (typeof window !== 'undefined') {
  // Warning: `restoreMocks: true` in vitest.config.ts will
  // cause this global mockImplementation to be **reset**
  // before any tests are run!
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

Object.defineProperties(globalThis, {
  TextDecoder: { value: TextDecoder },
  TextEncoder: { value: TextEncoder },
  CSS: {
    value: {
      supports: (_k: any, _v: any) => false,
      escape: (v: any) => v,
    },
  },
  ReadableStream: { value: ReadableStream },
  TransformStream: { value: TransformStream },
})

if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn()
}
