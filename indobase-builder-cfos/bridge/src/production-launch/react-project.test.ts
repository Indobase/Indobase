import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { flattenSafeFiles, isViteReactProject, viteBuildScriptError } from './react-project.ts'

const vitePkg = JSON.stringify({
  scripts: { build: 'vite build' },
  dependencies: { react: '19.0.0' },
  devDependencies: { vite: '6.0.0' },
})

describe('isViteReactProject', () => {
  it('is true for package.json vite build + react + index.html + src/*.tsx', () => {
    assert.equal(
      isViteReactProject({
        'package.json': vitePkg,
        'index.html': '<div id="root"></div>',
        'src/App.tsx': 'export default function App(){return null}',
      }),
      true,
    )
  })

  it('is true for src/*.ts as well as tsx', () => {
    assert.equal(
      isViteReactProject({
        'package.json': vitePkg,
        'index.html': '<div id="root"></div>',
        'src/main.ts': 'console.log(1)',
      }),
      true,
    )
  })

  it('is false without a Vite + React tree', () => {
    assert.equal(isViteReactProject({ 'index.html': '<h1>no</h1>' }), false)
    assert.equal(
      isViteReactProject({
        'package.json': '{"scripts":{"build":"tsc"}}',
        'index.html': '<div id="root"></div>',
        'src/App.tsx': 'export default function App(){return null}',
      }),
      false,
    )
    assert.equal(
      isViteReactProject({
        'package.json': JSON.stringify({
          scripts: { build: 'vite build' },
          dependencies: { vue: '3' },
          devDependencies: { vite: '6' },
        }),
        'index.html': '<div id="root"></div>',
        'src/App.tsx': 'export default function App(){return null}',
      }),
      false,
    )
    assert.equal(
      isViteReactProject({
        'package.json': JSON.stringify({
          scripts: { build: 'vite build' },
          dependencies: { react: '19' },
        }),
        'index.html': '<div id="root"></div>',
        'src/App.tsx': 'export default function App(){return null}',
      }),
      false,
    )
    assert.equal(
      isViteReactProject({
        'package.json': vitePkg,
        'index.html': '<div id="root"></div>',
      }),
      false,
    )
    assert.equal(isViteReactProject({ 'package.json': '{', 'index.html': '<div>', 'src/App.tsx': '' }), false)
    assert.equal(isViteReactProject(null), false)
  })

  it('drops parent-path keys when flattening', () => {
    const flat = flattenSafeFiles({ '../secret': 'x', 'src/App.tsx': 'ok' })
    assert.equal(flat['../secret'], undefined)
    assert.equal(flat['src/App.tsx'], 'ok')
  })

  it('explains missing vite trees', () => {
    assert.match(viteBuildScriptError({ 'index.html': '<h1>x</h1>' }) || '', /Vite/)
    assert.equal(
      viteBuildScriptError({
        'package.json': vitePkg,
        'index.html': '<div id="root"></div>',
        'src/App.tsx': 'export default function App(){return null}',
      }),
      null,
    )
  })
})
