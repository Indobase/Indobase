import { describe, expect, it } from 'vitest'

import {
  MAX_DEPLOYMENT_ARTIFACT_FILES,
  resolveDeploymentStorageUrl,
  resolveProjectSiteRootUrl,
  validateDeploymentArtifacts,
} from './deployment-artifacts'

describe('deployment-artifacts', () => {
  it('accepts a minimal static site bundle', () => {
    const files = validateDeploymentArtifacts({
      'index.html': '<!doctype html><html></html>',
      'assets/app.js': 'console.log("ok")',
    })

    expect(files['index.html']).toContain('<!doctype html>')
    expect(files['assets/app.js']).toBe('console.log("ok")')
  })

  it('rejects bundles without index.html', () => {
    expect(() =>
      validateDeploymentArtifacts({
        'assets/app.js': 'console.log("ok")',
      })
    ).toThrow('index.html')
  })

  it('rejects path traversal and unsupported file types', () => {
    expect(() =>
      validateDeploymentArtifacts({
        '../index.html': '<html></html>',
      })
    ).toThrow('Invalid deployment artifact path')

    expect(() =>
      validateDeploymentArtifacts({
        'index.html': '<html></html>',
        'bundle.wasm': 'binary',
      })
    ).toThrow('Unsupported deployment artifact type')
  })

  it('enforces file count limits', () => {
    const files = Object.fromEntries(
      Array.from({ length: MAX_DEPLOYMENT_ARTIFACT_FILES + 1 }, (_, index) => [
        index === 0 ? 'index.html' : `assets/file-${index}.js`,
        index === 0 ? '<html></html>' : 'ok',
      ])
    )

    expect(() => validateDeploymentArtifacts(files)).toThrow('file limit')
  })

  it('resolves root and storage fallback URLs', () => {
    const apiOrigin = 'https://demo.indobase.in'
    expect(resolveProjectSiteRootUrl(apiOrigin)).toBe('https://demo.indobase.in/')
    expect(
      resolveDeploymentStorageUrl({
        apiOrigin,
        deploymentId: 'dep-1',
        indexPath: 'index.html',
      })
    ).toBe('https://demo.indobase.in/storage/v1/object/public/hosting/sites/dep-1/index.html')
  })
})
