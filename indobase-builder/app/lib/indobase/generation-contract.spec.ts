import { describe, expect, it } from 'vitest';
import {
  getGenerationContractAppendix,
  inferBuilderProjectTarget,
  inspectOneShotBuildResponse,
  validateGeneratedProjectContract,
} from './generation-contract';

describe('inferBuilderProjectTarget', () => {
  it('selects mobile only for explicit native intent', () => {
    expect(
      inferBuilderProjectTarget([
        { id: '1', role: 'user', content: 'Build an Android and iOS mobile app for recipes.' },
      ]),
    ).toBe('mobile');
  });

  it('keeps a responsive website on the web contract', () => {
    expect(
      inferBuilderProjectTarget([
        { id: '1', role: 'user', content: 'Build a responsive website that works on mobile.' },
      ]),
    ).toBe('web');
  });

  it('preserves Expo target for follow-up edits', () => {
    expect(
      inferBuilderProjectTarget([{ id: '1', role: 'user', content: 'Make the buttons more rounded.' }], {
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({ dependencies: { expo: '~53.0.0' } }),
        },
      }),
    ).toBe('mobile');
  });
});

describe('validateGeneratedProjectContract', () => {
  it('accepts a runnable Vite project', () => {
    expect(
      validateGeneratedProjectContract({
        'package.json': JSON.stringify({ scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' } }),
        'index.html': '<div id="root"></div>',
        'src/main.tsx': 'export {};',
      }),
    ).toEqual({ target: 'web', issues: [], valid: true });
  });

  it('rejects an Expo project that cannot export a deployable web build', () => {
    expect(
      validateGeneratedProjectContract({
        'package.json': JSON.stringify({
          dependencies: { expo: '~53.0.0' },
          scripts: { build: 'expo start' },
        }),
        'app.json': '{}',
        'App.tsx': 'export default function App() { return null; }',
      }).issues,
    ).toContain('Mobile build script must export Expo for web.');
  });

  it('requires a root package manifest', () => {
    expect(validateGeneratedProjectContract({ 'index.html': '<main />' })).toMatchObject({
      valid: false,
      issues: ['Missing root package.json.'],
    });
  });
});

describe('getGenerationContractAppendix', () => {
  it('forbids nested Expo generation', () => {
    expect(getGenerationContractAppendix('mobile')).toContain('do NOT create a nested application directory');
  });

  it('requires install, start, and post-build recommendations in the initial response', () => {
    const appendix = getGenerationContractAppendix('web');

    expect(appendix).toContain('same response');
    expect(appendix).toContain('npm install');
    expect(appendix).toContain('<boltAction type="start">');
    expect(appendix).toContain('<bolt-quick-actions>');
    expect(appendix).toContain('Never ask the user to choose a recommendation before building');
  });
});

describe('inspectOneShotBuildResponse', () => {
  it('accepts a complete runnable initial response', () => {
    const response = `
<boltArtifact id="app" title="App">
  <boltAction type="file" filePath="package.json">{"scripts":{"dev":"vite --host 0.0.0.0"}}</boltAction>
  <boltAction type="file" filePath="index.html"><div id="root"></div></boltAction>
  <boltAction type="shell">npm install</boltAction>
  <boltAction type="start">npm run dev</boltAction>
</boltArtifact>
<bolt-quick-actions>
  <bolt-quick-action type="message" message="Polish the hero">Polish the hero</bolt-quick-action>
</bolt-quick-actions>`;

    expect(inspectOneShotBuildResponse(response)).toEqual({ complete: true, issues: [] });
  });

  it('reports missing execution actions without requiring recommendations', () => {
    expect(
      inspectOneShotBuildResponse(
        '<boltArtifact id="app" title="App"><boltAction type="file" filePath="package.json">{}</boltAction></boltArtifact>',
      ),
    ).toEqual({
      complete: false,
      issues: ['missing npm install shell action', 'missing start action'],
    });
  });
});
