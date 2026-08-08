import {
  resolveStockPlaceholdersInSources,
  type StockSearchFn,
} from './resolve-stock-placeholders';

/**
 * Client-side search against Builder stock API (Openverse-backed).
 */
export function createBrowserStockSearch(): StockSearchFn {
  const cache = new Map<string, string | null>();

  return async (query: string) => {
    const key = query.trim().toLowerCase();
    if (cache.has(key)) {
      return cache.get(key) ?? null;
    }

    try {
      const resp = await fetch('/api/indobase/stock-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ queries: [query] }),
      });

      if (!resp.ok) {
        cache.set(key, null);
        return null;
      }

      const data = (await resp.json()) as {
        results?: Record<string, { url?: string }>;
      };
      const url = data.results?.[query]?.url || data.results?.[Object.keys(data.results || {})[0]]?.url || null;
      const https = url && url.startsWith('https://') ? url : null;
      cache.set(key, https);
      return https;
    } catch {
      cache.set(key, null);
      return null;
    }
  };
}

export async function resolveStockInGeneratedSources(sources: Record<string, string>): Promise<{
  changedFiles: string[];
  unresolved: string[];
}> {
  return resolveStockPlaceholdersInSources(sources, createBrowserStockSearch());
}
