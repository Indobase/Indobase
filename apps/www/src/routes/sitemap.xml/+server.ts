import { DEFAULT_HOST } from '$lib/utils/metadata';

/**
 * XML sitemap for search engines. Lists the public, indexable marketing pages. Add entries here as
 * new public routes ship (a blog, docs, etc.), or generate them from a content source.
 */

type SitemapEntry = {
    path: string;
    changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
    priority: number;
};

const PAGES: SitemapEntry[] = [
    { path: '/', changefreq: 'weekly', priority: 1.0 },
    { path: '/pricing', changefreq: 'weekly', priority: 0.9 },
    { path: '/contact-us', changefreq: 'monthly', priority: 0.6 },
    { path: '/contact-us/enterprise', changefreq: 'monthly', priority: 0.6 },
    { path: '/privacy', changefreq: 'yearly', priority: 0.3 },
    { path: '/terms', changefreq: 'yearly', priority: 0.3 },
    { path: '/dpdp', changefreq: 'yearly', priority: 0.3 }
];

export const prerender = true;

export async function GET() {
    const urls = PAGES.map(
        (page) => `  <url>
    <loc>${DEFAULT_HOST}${page.path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`
    ).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

    return new Response(xml, {
        headers: {
            'content-type': 'application/xml; charset=utf-8',
            'cache-control': 'public, max-age=3600'
        }
    });
}
