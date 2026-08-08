/**
 * Replace agent stock placeholders with real Openverse URLs.
 *
 * Supported markers (preferred — never invent Pexels/Unsplash IDs):
 * - data-indobase-stock="coffee shop hero"
 * - src="indobase-stock:coffee shop hero"
 * - url('indobase-stock:modern office lobby')
 *
 * Also rewrites hallucinated Unsplash/Pexels https URLs when an alt / nearby
 * data-indobase-stock query is available; otherwise uses a generic query from path crumbs.
 */

export type StockSearchFn = (query: string) => Promise<string | null>;

const STOCK_PROTOCOL = /indobase-stock:([^"')\]]+)/gi;
const DATA_STOCK_ATTR = /data-indobase-stock=(["'])(.*?)\1/gi;
const HALLUCINATED_STOCK_HOST =
  /https?:\/\/(?:images\.)?(?:unsplash\.com|pexels\.com)\/[^\s"'`)]+/gi;

const UI_FILE = /\.(?:css|scss|sass|less|[cm]?[jt]sx?|html|vue|svelte)$/i;

/** Neutral SVG data-URI when Openverse has no hit — never invent Pexels/Unsplash IDs. */
export function stockFallbackDataUri(query: string): string {
  const label = query.trim().slice(0, 40).replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e8eef5"/><stop offset="1" stop-color="#d5e3f0"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><text x="50%" y="50%" text-anchor="middle" fill="#5a6b7d" font-family="system-ui,sans-serif" font-size="36">${label || 'Image'}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function collectStockQueries(content: string): string[] {
  const queries = new Set<string>();

  for (const match of content.matchAll(DATA_STOCK_ATTR)) {
    const q = match[2]?.trim();
    if (q) {
      queries.add(q);
    }
  }

  for (const match of content.matchAll(STOCK_PROTOCOL)) {
    const q = decodeURIComponent(match[1] || '')
      .trim()
      .replace(/\+/g, ' ');
    if (q) {
      queries.add(q);
    }
  }

  // img with hallucinated stock src — prefer alt text as search query
  const imgTag =
    /<img\b[^>]*\bsrc=(["'])(https?:\/\/(?:images\.)?(?:unsplash|pexels)\.com\/[^"']+)\1[^>]*>/gi;
  for (const match of content.matchAll(imgTag)) {
    const tag = match[0];
    const alt = tag.match(/\balt=(["'])(.*?)\1/i)?.[2]?.trim();
    const dataQ = tag.match(/\bdata-indobase-stock=(["'])(.*?)\1/i)?.[2]?.trim();
    const q = dataQ || alt;
    if (q) {
      queries.add(q);
    }
  }

  return [...queries];
}

export function applyStockUrlMap(content: string, urlByQuery: Map<string, string>): string {
  if (urlByQuery.size === 0) {
    return content;
  }

  const normalizeKey = (q: string) => q.trim().toLowerCase();

  const lookup = (raw: string): string | null => {
    const key = normalizeKey(raw);
    if (urlByQuery.has(key)) {
      return urlByQuery.get(key)!;
    }
    for (const [k, v] of urlByQuery) {
      if (k === key || k.includes(key) || key.includes(k)) {
        return v;
      }
    }
    return null;
  };

  let out = content.replace(STOCK_PROTOCOL, (_full, q: string) => {
    const decoded = decodeURIComponent(String(q)).trim().replace(/\+/g, ' ');
    return lookup(decoded) || _full;
  });

  // Fill src when data-indobase-stock / alt maps to a resolved URL
  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    const dataQ = tag.match(/\bdata-indobase-stock=(["'])(.*?)\1/i)?.[2]?.trim();
    const alt = tag.match(/\balt=(["'])(.*?)\1/i)?.[2]?.trim();
    const url = (dataQ && lookup(dataQ)) || (alt && lookup(alt));
    if (!url) {
      return tag;
    }
    if (/\bsrc=(["'])(?:\s*|indobase-stock:[^"']*|https?:\/\/(?:images\.)?(?:unsplash|pexels)\.com\/[^"']*)\1/i.test(tag)) {
      return tag.replace(/\bsrc=(["'])[^"']*\1/i, `src=$1${url}$1`);
    }
    if (!/\bsrc=/i.test(tag)) {
      return tag.replace(/<img\b/i, `<img src="${url}"`);
    }
    return tag;
  });

  // JSX-style: src={"indobase-stock:..."} or src={'indobase-stock:...'}
  out = out.replace(/src=\{(["'])indobase-stock:([^"']+)\1\}/gi, (_full, quote: string, q: string) => {
    const url = lookup(decodeURIComponent(q).trim().replace(/\+/g, ' '));
    return url ? `src={${quote}${url}${quote}}` : _full;
  });

  return out;
}

/**
 * Rewrite sources that contain stock markers. Mutates values in `sources` for changed files.
 * Returns list of file paths that changed.
 */
export async function resolveStockPlaceholdersInSources(
  sources: Record<string, string>,
  search: StockSearchFn,
  options?: { maxQueries?: number },
): Promise<{ changedFiles: string[]; unresolved: string[] }> {
  const maxQueries = options?.maxQueries ?? 12;
  const allQueries: string[] = [];
  const perFileQueries = new Map<string, string[]>();

  for (const [filePath, content] of Object.entries(sources)) {
    if (!UI_FILE.test(filePath)) {
      continue;
    }
    if (filePath.includes('node_modules') || filePath.includes('dist/')) {
      continue;
    }
    const qs = collectStockQueries(content);
    if (qs.length) {
      perFileQueries.set(filePath, qs);
      for (const q of qs) {
        if (!allQueries.includes(q)) {
          allQueries.push(q);
        }
      }
    }
  }

  const toSearch = allQueries.slice(0, maxQueries);
  const urlByQuery = new Map<string, string>();
  const unresolved: string[] = [];

  for (const q of toSearch) {
    try {
      const url = await search(q);
      if (url) {
        urlByQuery.set(q.trim().toLowerCase(), url);
      } else {
        unresolved.push(q);
        urlByQuery.set(q.trim().toLowerCase(), stockFallbackDataUri(q));
      }
    } catch {
      unresolved.push(q);
      urlByQuery.set(q.trim().toLowerCase(), stockFallbackDataUri(q));
    }
  }

  const changedFiles: string[] = [];

  for (const [filePath, qs] of perFileQueries) {
    const before = sources[filePath];
    const after = applyStockUrlMap(before, urlByQuery);
    if (after !== before) {
      sources[filePath] = after;
      changedFiles.push(filePath);
    } else if (qs.some((q) => urlByQuery.has(q.trim().toLowerCase()))) {
      // protocol replacements might still match — apply again is noop
    }
  }

  return { changedFiles, unresolved };
}

/** True when content still uses inventable stock hosts or unresolved markers. */
export function hasUnresolvedHallucinatedStock(content: string): boolean {
  return (
    /https?:\/\/(?:images\.)?(?:unsplash\.com|pexels\.com)\//i.test(content) ||
    /indobase-stock:/i.test(content)
  );
}
