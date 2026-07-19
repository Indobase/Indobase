import { describe, expect, it, vi } from 'vitest';
import {
  findMissingLocalImportDiagnostics,
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

  it('flags an incomplete scaffold where App imports a component that was never generated', () => {
    const diagnostics = findMissingLocalImportDiagnostics({
      'src/App.tsx': `import Hero from './components/Hero';
import Navbar from './components/Navbar';
import JuiceCards from './components/JuiceCards';
import ContactForm from './components/ContactForm';

export default function App() {
  return (
    <main>
      <Navbar />
      <Hero />
      <JuiceCards />
      <ContactForm />
    </main>
  );
}`,
      'src/components/Hero.tsx': 'export default function Hero() { return <section>Hero</section>; }',
      'src/components/Navbar.tsx': 'export default function Navbar() { return <nav>Nav</nav>; }',
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        filePath: 'src/App.tsx',
        message: expect.stringContaining('./components/JuiceCards'),
        line: 3,
        source: 'structure',
      }),
      expect.objectContaining({
        filePath: 'src/App.tsx',
        message: expect.stringContaining('./components/ContactForm'),
        line: 4,
        source: 'structure',
      }),
    ]);
  });

  it('resolves extensionless, explicit-extension, index, and parent-relative imports', () => {
    const diagnostics = findMissingLocalImportDiagnostics({
      'src/App.tsx': `import Hero from './components/Hero';
import { helpers } from './lib/helpers.ts';
import Cards from './components/cards';
export { default as Footer } from './components/Footer.jsx';`,
      'src/components/Hero.tsx': 'export default function Hero() { return <section />; }',
      'src/components/Footer.jsx': 'export default function Footer() { return <footer />; }',
      'src/components/cards/index.tsx': 'export default function Cards() { return <div />; }',
      'src/lib/helpers.ts': 'export const helpers = {};',
      'src/components/cards/Card.tsx': `import type { CardProps } from '../../types';`,
      'src/types.ts': 'export type CardProps = { name: string };',
    });

    expect(diagnostics).toEqual([]);
  });

  it('ignores package imports and non-source assets', () => {
    const diagnostics = findMissingLocalImportDiagnostics({
      'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter';
import './index.css';
import logoUrl from './assets/logo.svg';
import App from './App';`,
      'src/App.tsx': 'export default function App() { return <main />; }',
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
