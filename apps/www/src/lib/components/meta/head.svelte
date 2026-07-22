<script lang="ts">
    import { page } from '$app/stores';
    import {
        getInlinedScriptTag,
        softwareAppSchema,
        organizationJsonSchema,
        DEFAULT_DESCRIPTION,
        DEFAULT_HOST
    } from '$lib/utils/metadata';

    type Props = {
        title?: string;
        description?: string;
        ogImage?: string;
        /** Override the canonical URL; defaults to the current path on the primary host. */
        canonical?: string;
        /** 'website' for pages, 'article' for blog posts. */
        ogType?: 'website' | 'article';
        noindex?: boolean;
    };

    const {
        title = 'Indobase — India-first open-source backend & AI app builder',
        description = DEFAULT_DESCRIPTION,
        ogImage = `${DEFAULT_HOST}/images/open-graph/website.png`,
        canonical,
        ogType = 'website',
        noindex = false
    }: Props = $props();

    // Canonical avoids duplicate-content penalties (trailing slashes, query params, alt hosts).
    const canonicalUrl = $derived(canonical ?? `${DEFAULT_HOST}${$page.url.pathname}`);
</script>

<svelte:head>
    <title>{title}</title>
    <link rel="canonical" href={canonicalUrl} />
    {#if noindex}
        <meta name="robots" content="noindex, nofollow" />
    {:else}
        <meta name="robots" content="index, follow, max-image-preview:large" />
    {/if}

    <meta name="description" content={description} />

    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content={ogType} />
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:site_name" content="Indobase" />
    <meta property="og:image" content={ogImage} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={ogImage} />

    {@html getInlinedScriptTag(softwareAppSchema())}
    {@html getInlinedScriptTag(organizationJsonSchema())}
</svelte:head>
