import { describe, expect, it } from 'vitest';
import {
  detectProjectRootPrefix,
  hasRunnablePackageJson,
  listPackageJsonPaths,
  normalizeProjectFilesRoot,
} from './normalize-project-files';

const vitePackage = JSON.stringify({
  name: 'app',
  scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' },
});

describe('normalizeProjectFilesRoot', () => {
  it('leaves root-level scaffolds unchanged', () => {
    const files = {
      'package.json': vitePackage,
      'index.html': '<div id="root"></div>',
      'src/main.tsx': 'export {};',
    };

    expect(normalizeProjectFilesRoot(files)).toEqual({
      files,
      rootPrefix: '',
      flattened: false,
    });
    expect(detectProjectRootPrefix(files)).toBe('');
    expect(hasRunnablePackageJson(files)).toBe(true);
  });

  it('flattens a single nested app directory', () => {
    const files = {
      'my-app/package.json': vitePackage,
      'my-app/index.html': '<div id="root"></div>',
      'my-app/src/App.tsx': 'export default function App() { return null; }',
    };

    const result = normalizeProjectFilesRoot(files);

    expect(result.flattened).toBe(true);
    expect(result.rootPrefix).toBe('my-app/');
    expect(result.files['package.json']).toBe(vitePackage);
    expect(result.files['index.html']).toContain('root');
    expect(result.files['src/App.tsx']).toContain('App');
    expect(listPackageJsonPaths(files)).toEqual(['my-app/package.json']);
  });

  it('prefers a runnable nested package.json over a non-runnable sibling', () => {
    const files = {
      'vendor/package.json': JSON.stringify({ name: 'vendor' }),
      'web/package.json': vitePackage,
      'web/index.html': '<html></html>',
    };

    const result = normalizeProjectFilesRoot(files);

    expect(result.rootPrefix).toBe('web/');
    expect(result.files['package.json']).toBe(vitePackage);
    expect(result.files['index.html']).toBe('<html></html>');
  });

  it('reports missing package.json without inventing one', () => {
    const files = { 'src/App.tsx': 'export {};', 'index.html': '<main />' };

    expect(normalizeProjectFilesRoot(files).files['package.json']).toBeUndefined();
    expect(hasRunnablePackageJson(files)).toBe(false);
  });
});
