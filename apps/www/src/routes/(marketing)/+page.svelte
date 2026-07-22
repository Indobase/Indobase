<script lang="ts">
    import Hero from './(components)/hero.svelte';
    import HowItWorks from './(components)/how-it-works.svelte';
    import TemplateStarters from './(components)/template-starters.svelte';
    import Numbers from './(components)/numbers.svelte';
    import PlatformEdge from './(components)/platform-edge.svelte';
    import Pricing from './(components)/pricing.svelte';
    import FinalCta from './(components)/final-cta.svelte';
    import { Main } from '$lib/layouts';
    import Head from '$lib/components/meta/head.svelte';
    import { MainFooter } from '$lib/components';
</script>

<Head
    title="Indobase — Build apps with AI"
    description="Describe your app and Indobase Builder creates it with a live preview, one-click publish, and Studio backend when you need auth, database, and storage."
/>

<div class="marketing-home">
    <Main>
        <Hero />
        <HowItWorks />
        <TemplateStarters />
        <Numbers />
        <PlatformEdge />
        <Pricing />
        <FinalCta />
    </Main>

    <div class="container">
        <MainFooter />
    </div>
</div>

<style>
    /* Force a Lovable-like light marketing canvas while respecting .dark body via nested sections */
    :global(.marketing-home) {
        background: #F7FAFD;
    }

    :global(body.dark .marketing-home) {
        background: #0c0d10;
    }

    :global(.marketing-home main) {
        gap: 0 !important;
        row-gap: 0 !important;
    }
</style>
