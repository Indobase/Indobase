import { describe, expect, it } from 'vitest';
import {
  getCompactGenerationContractAppendix,
  getGenerationContractAppendix,
  getInstantBuildPlan,
  inferBuilderProjectTarget,
  inspectOneShotBuildResponse,
  isComplexBuildIntent,
  isInitialScaffoldTurn,
  isSimpleFirstScaffoldTurn,
  validateGeneratedProjectContract,
} from './generation-contract';

describe('inferBuilderProjectTarget', () => {
  it('selects mobile only for explicit native intent', () => {
    expect(
      inferBuilderProjectTarget([
        { role: 'user', content: 'Build an Android and iOS mobile app for recipes.' },
      ]),
    ).toBe('mobile');
  });

  it('keeps a responsive website on the web contract', () => {
    expect(
      inferBuilderProjectTarget([
        { role: 'user', content: 'Build a responsive website that works on mobile.' },
      ]),
    ).toBe('web');
  });

  it('preserves Expo target for follow-up edits', () => {
    expect(
      inferBuilderProjectTarget([{ role: 'user', content: 'Make the buttons more rounded.' }], {
        '/home/project/package.json': {
          type: 'file',
          isBinary: false,
          content: JSON.stringify({ dependencies: { expo: '~53.0.0' } }),
        },
      }),
    ).toBe('mobile');
  });
});

describe('isSimpleFirstScaffoldTurn', () => {
  it('accepts a short UI-only first prompt', () => {
    expect(
      isSimpleFirstScaffoldTurn([
        { role: 'user', content: 'Build a simple hello world landing page with a blue Get started button' },
      ]),
    ).toBe(true);
  });

  it('rejects auth or payment prompts', () => {
    expect(isSimpleFirstScaffoldTurn([{ role: 'user', content: 'Build a login page with OAuth auth' }])).toBe(
      false,
    );
    expect(
      isSimpleFirstScaffoldTurn([{ role: 'user', content: 'Build a checkout page with Razorpay payments' }]),
    ).toBe(false);
  });

  it('rejects long prompts and follow-up turns after a scaffold', () => {
    expect(
      isSimpleFirstScaffoldTurn([
        {
          role: 'user',
          content:
            'Build a very long detailed multi-section marketing site with testimonials pricing FAQ blog careers about contact gallery portfolio case studies newsletter signup footer navigation and custom animations throughout the entire experience for desktop and tablet',
        },
      ]),
    ).toBe(false);

    expect(
      isSimpleFirstScaffoldTurn([
        { role: 'user', content: 'Build a hello world page' },
        {
          role: 'assistant',
          content: '<boltArtifact id="x"><boltAction type="file" filePath="index.html">hi</boltAction></boltArtifact>',
        },
        { role: 'user', content: 'Make the button red' },
      ]),
    ).toBe(false);
  });
});

describe('getInstantBuildPlan', () => {
  it('includes auth steps for login prompts without calling an LLM', () => {
    const plan = getInstantBuildPlan([{ role: 'user', content: 'Build a SaaS dashboard with login auth' }]);

    expect(isComplexBuildIntent([{ role: 'user', content: 'Build a SaaS dashboard with login auth' }])).toBe(true);
    expect(plan).toContain('## Build steps');
    expect(plan).toMatch(/Auth/i);
    expect(plan).toContain('Autonomy checklist');
    expect(plan).toContain('Design polish');
  });

  it('keeps a minimal plan for simple UI prompts', () => {
    const plan = getInstantBuildPlan([{ role: 'user', content: 'Build a hello world landing page' }]);

    expect(plan).toContain('minimal Vite');
    expect(plan).not.toMatch(/Payments/i);
    expect(plan).toMatch(/non-purple|industry-fit/i);
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

  it('uses a compact contract for simple web scaffolds', () => {
    const compact = getCompactGenerationContractAppendix('web');

    expect(compact).toContain('mode="compact"');
    expect(compact).toContain('as few files as possible');
    expect(compact.length).toBeLessThan(getGenerationContractAppendix('web').length);
  });
});

describe('isInitialScaffoldTurn', () => {
  it('treats clarifying-question assistant turns as still pre-scaffold', () => {
    expect(
      isInitialScaffoldTurn([
        { role: 'user', content: 'create a crm website' },
        { role: 'assistant', content: 'Before I build this, I need a couple of details...' },
        { role: 'user', content: 'you choose' },
      ]),
    ).toBe(true);
  });

  it('returns false once a file artifact has been produced', () => {
    expect(
      isInitialScaffoldTurn([
        { role: 'user', content: 'create a crm website' },
        {
          role: 'assistant',
          content:
            '<boltArtifact id="app" title="CRM"><boltAction type="file" filePath="package.json">{}</boltAction></boltArtifact>',
        },
      ]),
    ).toBe(false);
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

  it('reports missing execution actions without demanding recommendations', () => {
    expect(
      inspectOneShotBuildResponse(
        '<boltArtifact id="app" title="App"><boltAction type="file" filePath="package.json">{}</boltAction></boltArtifact>',
      ),
    ).toEqual({
      complete: false,
      issues: ['missing npm install shell action', 'missing start action'],
    });
  });

  it('does not force a continuation just because quick-action chips are missing', () => {
    const runnable = `
<boltArtifact id="app" title="App">
  <boltAction type="file" filePath="package.json">{}</boltAction>
  <boltAction type="shell">npm install</boltAction>
  <boltAction type="start">npm run dev</boltAction>
</boltArtifact>
Would you like me to add a dark mode toggle or product pages?`;

    expect(inspectOneShotBuildResponse(runnable)).toEqual({ complete: true, issues: [] });
  });
});
