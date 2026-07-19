import { describe, expect, it, vi } from 'vitest';
import {
  validateGeneratedSource,
  validateGeneratedSources,
  verifyViteSourceTransforms,
} from './generated-code-validation';

describe('generated code validation', () => {
  it('reports return outside a function with the implicated file and location', () => {
    const services = `const services = [
  { name: 'Grooming' },
]

export function Services() {
  const title = 'Paws & Shine'
}

return (
  <section className="services">
    {services.map((service) => <article>{service.name}</article>)}
  </section>
)`;

    expect(validateGeneratedSource('src/components/Services.jsx', services)).toEqual([
      expect.objectContaining({
        filePath: 'src/components/Services.jsx',
        line: 9,
        message: expect.stringMatching(/return.*outside.*function/i),
        source: 'syntax',
      }),
    ]);
  });

  it('rejects duplicate JSX attributes and leaked Builder markup', () => {
    const duplicate = validateGeneratedSource(
      'src/App.tsx',
      `export const App = () => <main className="one" className="two">Hello</main>`,
    );
    const leaked = validateGeneratedSource(
      'src/main.jsx',
      `const value = <boltAction type="file">not application source</boltAction>`,
    );

    expect(duplicate).toEqual([
      expect.objectContaining({
        filePath: 'src/App.tsx',
        message: 'Duplicate JSX attribute "className".',
      }),
    ]);
    expect(leaked).toEqual([
      expect.objectContaining({
        filePath: 'src/main.jsx',
        message: 'Builder artifact markup leaked into generated source.',
      }),
    ]);
  });

  it('accepts valid JavaScript, JSX, TypeScript, and TSX', () => {
    const diagnostics = validateGeneratedSources({
      'src/plain.js': 'export const answer = 42;',
      'src/card.jsx': 'export const Card = () => <article>Card</article>;',
      'src/value.ts': 'export const value: number = 42;',
      'src/App.tsx': 'export function App(): JSX.Element { return <main>Ready</main>; }',
    });

    expect(diagnostics).toEqual([]);
  });

  it('treats a Vite transform failure as an unhealthy preview', async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      return url.includes('Services.jsx')
        ? new Response(
            JSON.stringify({ message: "src/components/Services.jsx: 'return' outside of function. (30:4)" }),
            {
              status: 500,
            },
          )
        : new Response('export const ok = true', { status: 200 });
    });

    await expect(
      verifyViteSourceTransforms(
        'https://preview.local/',
        ['src/main.jsx', 'src/components/Services.jsx'],
        fetcher as typeof fetch,
      ),
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          filePath: 'src/components/Services.jsx',
          message: expect.stringContaining("'return' outside of function"),
          source: 'preview',
        }),
      ],
    });
  });
});
