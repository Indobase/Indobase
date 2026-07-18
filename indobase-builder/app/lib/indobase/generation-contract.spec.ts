import { describe, expect, it } from 'vitest';
import {
  getGenerationContractAppendix,
  inferBuilderProjectTarget,
  validateGeneratedProjectContract,
} from './generation-contract';

describe('inferBuilderProjectTarget', () => {
  it('selects mobile only for explicit native intent', () => {
    expect(
      inferBuilderProjectTarget([{ id: '1', role: 'user', content: 'Build an Android and iOS mobile app for recipes.' }]),
    ).toBe('mobile');
  });

  it('keeps a responsive website on the web contract', () => {
    expect(
      inferBuilderProjectTarget([{ id: '1', role: 'user', content: 'Build a responsive website that works on mobile.' }]),
    ).toBe('web');
  });

  it('preserves Expo target for follow-up edits', () => {
    expect(
      inferBuilderProjectTarget(
        [{ id: '1', role: 'user', content: 'Make the buttons more rounded.' }],
        {
          '/home/project/package.json': {
            type: 'file',
            isBinary: false,
            content: JSON.stringify({ dependencies: { expo: '~53.0.0' } }),
          },
        },
      ),
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
});
