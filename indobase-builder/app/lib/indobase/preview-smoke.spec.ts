import { describe, expect, it } from 'vitest';
import { smokeCheckPreviewHtml } from './preview-smoke';

describe('smokeCheckPreviewHtml', () => {
  it('flags empty shell without a module entry', async () => {
    const fetcher = async () =>
      new Response('<html><body><div id="root"></div></body></html>', { status: 200 });

    const diagnostics = await smokeCheckPreviewHtml('http://localhost:5173/', fetcher as typeof fetch);
    expect(diagnostics.some((d) => d.source === 'structure')).toBe(true);
  });

  it('passes a normal Vite index with module entry', async () => {
    const fetcher = async () =>
      new Response(
        '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
        { status: 200 },
      );

    await expect(smokeCheckPreviewHtml('http://localhost:5173/', fetcher as typeof fetch)).resolves.toEqual([]);
  });
});
