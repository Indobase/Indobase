import { describe, expect, it, vi } from 'vitest';
import {
  applyStockUrlMap,
  collectStockQueries,
  resolveStockPlaceholdersInSources,
} from './resolve-stock-placeholders';

describe('collectStockQueries', () => {
  it('collects data-indobase-stock and protocol markers', () => {
    const html = `
      <img data-indobase-stock="coffee shop interior" alt="Cafe" src="" />
      <div style="background:url('indobase-stock:modern office')" />
    `;
    const qs = collectStockQueries(html);
    expect(qs).toContain('coffee shop interior');
    expect(qs).toContain('modern office');
  });

  it('uses alt text when unsplash src is hallucinated', () => {
    const html = `<img src="https://images.unsplash.com/photo-123" alt="Dental clinic reception" />`;
    expect(collectStockQueries(html)).toContain('Dental clinic reception');
  });
});

describe('applyStockUrlMap', () => {
  it('replaces protocol and empty src with resolved URL', () => {
    const map = new Map([['coffee shop interior', 'https://example.com/a.jpg']]);
    const out = applyStockUrlMap(
      `<img data-indobase-stock="coffee shop interior" alt="Cafe" src="" />
       background: url("indobase-stock:coffee shop interior")`,
      map,
    );
    expect(out).toContain('https://example.com/a.jpg');
    expect(out).not.toContain('indobase-stock:');
    expect(out).not.toMatch(/src=""/);
  });
});

describe('resolveStockPlaceholdersInSources', () => {
  it('rewrites sources via search fn', async () => {
    const sources = {
      'src/Hero.tsx': `<img data-indobase-stock="handmade ceramics" alt="Bowls" src="indobase-stock:handmade ceramics" />`,
    };
    const search = vi.fn(async () => 'https://cdn.example/ceramics.jpg');
    const { changedFiles, unresolved } = await resolveStockPlaceholdersInSources(sources, search);
    expect(changedFiles).toEqual(['src/Hero.tsx']);
    expect(unresolved).toEqual([]);
    expect(sources['src/Hero.tsx']).toContain('https://cdn.example/ceramics.jpg');
    expect(search).toHaveBeenCalled();
  });
});
