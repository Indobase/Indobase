import type { AuthorData } from '$routes/blog/content';

export const DEFAULT_HOST = 'https://indobase.in';
export const DEFAULT_DESCRIPTION =
    'Indobase is an open-source platform for building applications at any scale, using your preferred programming languages and tools.';

/**
 * Open Graph image for a page.
 *
 * This previously called `https://og.appwrite.global/image.png` — a third-party Appwrite service —
 * which rendered Appwrite-branded cards on every share and sent our page titles to their server.
 * Serve our own static card instead. Args are kept so call sites need no change, and so this can
 * become a real per-page renderer later without another signature churn.
 */
export function buildOpenGraphImage(_title: string, _description: string): string {
    return `${DEFAULT_HOST}/images/open-graph/website.png`;
}

/**
 * Returns an inlined JSON-LD script tag without breaking IDE formatting.
 */
export function getInlinedScriptTag(jsonSchema: string): string {
    return `<script type="application/ld+json">${jsonSchema}</` + 'script>';
}

/**
 * Returns the JSON-LD schema for the Indobase organization.
 */
export function organizationJsonSchema() {
    return JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        url: 'https://indobase.in',
        sameAs: [
            'https://www.linkedin.com/company/indobase',
            'https://github.com/indobase/indobase',
            'https://www.producthunt.com/products/indobase',
            'https://x.com/indobase'
        ],
        name: 'Indobase',
        legalName: 'Indobase Technologies Ltd.',
        description:
            'A secure open-source backend server provides the core APIs required to build web and mobile applications. Indobase provides authentication, database, storage, functions, messaging, and advanced realtime capabilities.',
        logo: 'https://indobase.in/assets/logotype/indobase-white.png'
    });
}

/**
 * Returns the JSON-LD schema for the Indobase software application.
 */
export function softwareAppSchema() {
    return JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Indobase',
        applicationCategory: 'Software development',
        featureList: 'Authentication, Database, Storage, Functions, Messaging',
        audience: {
            '@type': 'Audience',
            audienceType: 'Developers'
        },
        aggregateRating: {
            '@type': 'AggregateRating',
            bestRating: '5',
            ratingValue: '4.8',
            ratingCount: '74'
        }
    });
}

/**
 * Returns the JSON-LD schema for a blog post.
 */
export function createPostSchema(
    post: { title: string; cover: string; date: string; lastUpdated?: string },
    authors?: AuthorData | AuthorData[]
) {
    const authorsArray = Array.isArray(authors) ? authors : authors ? [authors] : [];

    return JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        image: [post.cover],
        datePublished: post.date,
        ...(post.lastUpdated && { dateModified: post.lastUpdated }),
        ...(authorsArray.length > 0 && {
            author: authorsArray.map((author) => ({
                '@type': 'Person',
                url: author.href,
                name: author.name
            }))
        })
    });
}

/**
 * Returns the JSON-LD schema for breadcrumbs.
 */
export function createBreadcrumbsSchema(articleInfo: {
    title: string;
    category: string;
    url: string;
}): string {
    return JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                    name: 'Blog',
                    item: 'https://indobase.in/blog'
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: articleInfo.category,
                item: `https://indobase.in/blog?category=${articleInfo.category}`
            },
            {
                '@type': 'ListItem',
                position: 3,
                name: articleInfo.title,
                item: articleInfo.url
            }
        ]
    });
}

/**
 * Returns the JSON-LD schema for faqs.
 */
export function createFaqSchema(
    faqs: Array<{
        question: string;
        answer: string;
    }>
): string {
    return JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer
            }
        }))
    });
}
