import { describe, expect, it } from 'vitest';
import { lintGeneratedVisualQuality } from './visual-quality-lint';

describe('lintGeneratedVisualQuality', () => {
  it('flags banned purple hex and Unsplash', () => {
    const diagnostics = lintGeneratedVisualQuality({
      'src/index.css': `
        :root { --color-primary: #9E7FFF; }
        .hero { background: url('https://images.unsplash.com/photo-123'); }
      `,
    });

    expect(diagnostics.some((d) => d.message.includes('#9E7FFF'))).toBe(true);
    expect(diagnostics.some((d) => d.message.includes('Unsplash'))).toBe(true);
    expect(diagnostics.every((d) => d.source === 'design')).toBe(true);
  });

  it('flags purple Tailwind utilities', () => {
    const diagnostics = lintGeneratedVisualQuality({
      'src/App.tsx': `export const App = () => <div className="bg-purple-500 from-violet-600 to-indigo-500" />`,
    });

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message).toMatch(/purple|violet|indigo/i);
  });

  it('flags Inter-only CSS font stacks', () => {
    const diagnostics = lintGeneratedVisualQuality({
      'src/styles.css': `body { font-family: Inter, system-ui; }`,
    });

    expect(diagnostics.some((d) => d.message.includes('Inter-only'))).toBe(true);
  });

  it('passes Indobase-safe palettes', () => {
    const diagnostics = lintGeneratedVisualQuality({
      'src/index.css': `
        :root {
          --color-primary: #3B8FD6;
          --color-accent: #C9A227;
        }
        body { font-family: "Fraunces", "DM Sans", sans-serif; }
      `,
      'src/App.tsx': `export const App = () => <main className="bg-sky-50 text-slate-900" />`,
    });

    expect(diagnostics).toEqual([]);
  });
});
