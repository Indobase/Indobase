import { describe, expect, it } from 'vitest'

import {
  normalizeMobileBuildSourcePath,
  validateMobileBuildSourceFiles,
} from './mobile-build-source'

const expoPackageJson = JSON.stringify({
  name: 'demo',
  dependencies: {
    expo: '~52.0.0',
    react: '18.3.1',
    'react-native': '0.76.0',
  },
})

describe('mobile-build-source', () => {
  it('normalizes safe relative paths', () => {
    expect(normalizeMobileBuildSourcePath('app/index.tsx')).toBe('app/index.tsx')
  })

  it('rejects traversal and blocked directories', () => {
    expect(() => normalizeMobileBuildSourcePath('../package.json')).toThrow(/Invalid/)
    expect(() => normalizeMobileBuildSourcePath('node_modules/expo/package.json')).toThrow(/cannot include/)
  })

  it('requires an Expo project with package.json', () => {
    const result = validateMobileBuildSourceFiles({
      'package.json': expoPackageJson,
      'app.json': JSON.stringify({ expo: { name: 'Demo' } }),
      'App.tsx': "export default function App() { return null }",
    })

    expect(result.files['App.tsx']).toContain('export default')
    expect(result.totalBytes).toBeGreaterThan(0)
  })

  it('rejects non-expo package.json', () => {
    expect(() =>
      validateMobileBuildSourceFiles({
        'package.json': JSON.stringify({ name: 'vite-app', dependencies: { vite: '^6.0.0' } }),
      }),
    ).toThrow(/Expo project/)
  })
})
