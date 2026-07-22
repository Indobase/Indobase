<script lang="ts" module>
    import { browser } from '$app/environment';
    import { type Reo, loadReoScript } from '$lib/reodotdev';

    /*
     * The marketing site is light-only.
     *
     * The theme store, the OS `prefers-color-scheme` probe, and the localStorage preference all
     * used to live here and defaulted to 'dark' — which is why the site rendered dark for every
     * first-time visitor. `light` is now set statically on <body> in app.html, so no theme class is
     * ever swapped at runtime and there is no dark flash before hydration.
     *
     * Consumers that varied by theme (the platform/technology logo sets) now reference the light
     * asset directly. The `.dark` class is never applied, so the remaining `dark:` utilities and
     * `#{$theme-dark}` SCSS blocks are unreachable rather than conditional.
     */
</script>

<script lang="ts">
    import '../app.css';
    import '$icons/output/web-icon.css';
    import ClientScss from '$lib/ClientScss.svelte';

    import { dev } from '$app/environment';
    import { page } from '$app/state';
    import { updated } from '$app/state';
    import { onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { loggedIn } from '$lib/utils/console';
    import { afterNavigate, beforeNavigate } from '$app/navigation';
    import { trackEvent } from '$lib/actions/analytics';
    import { capturePostHogPageview, initPostHog } from '$lib/analytics/posthog';
    import { saveReferrerAndUtmSource } from '$lib/utils/utm';
    import { Sprite } from '$lib/components/ui/icon/sprite';
    import { displayHiringMessage } from '$lib/utils/console';
    import { getCanonicalUrl } from '$lib/utils/canonical';

    const thresholds = [0.25, 0.5, 0.75];
    const tracked = new SvelteSet<number>();

    onMount(() => {
        displayHiringMessage();
        saveReferrerAndUtmSource(page.url);

        initPostHog();
        capturePostHogPageview(page.url.pathname);
    });

    afterNavigate(({ to }) => {
        if (!to?.url) return;
        capturePostHogPageview(to.url.pathname);
    });

    beforeNavigate(({ willUnload, to }) => {
        if (window) {
            tracked.clear();
        }

        if (updated.current && !willUnload && to?.url) {
            location.href = to.url.href;
        }
    });

    $effect(() => {
        if ($loggedIn) {
            document.body.dataset.loggedIn = '';
        }
    });

    let canonicalUrl = $derived<string>(getCanonicalUrl(page.url));

    function handleScroll() {
        const scrollY = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercentage = scrollY / docHeight;

        thresholds.forEach((threshold) => {
            if (scrollPercentage >= threshold && !tracked.has(threshold)) {
                const pageName =
                    page.url.pathname.slice(1) === ''
                        ? 'home'
                        : page.url.pathname.slice(1).replace(/\//g, '-');

                const eventName = `${pageName}_scroll-depth_${threshold * 100}prct_scroll`;
                tracked.add(threshold);
                trackEvent(eventName);
            }
        });
    }

    if (!dev && browser) {
        const clientID = '144fa7eaa4904e8';

        const reoPromise = loadReoScript({ clientID });
        reoPromise.then((reo: Reo) => {
            reo.init({ clientID });
        });
    }

    const { children } = $props();
</script>

<svelte:window on:scroll={handleScroll} />
<svelte:head>
    {#if !dev}
        <!-- Start cookieyes banner -->
        <script
            defer
            id="cookieyes"
            type="text/javascript"
            src="https://cdn-cookieyes.com/client_data/7d0de7a43cc518960906cf03/script.js"
        ></script>
        <!-- End cookieyes banner -->

        <!--suppress JSUnresolvedLibraryURL -->
        <script defer data-domain="indobase.in" src="https://plausible.io/js/script.js"></script>

        <!-- ZoomInfo snippet -->
        <script defer src="/scripts/zoominfo.js"></script>
    {/if}

    <!-- canonical url -->
    <link rel="canonical" href={canonicalUrl} />
</svelte:head>

<a
    class="bg-mint-500 focus:pointer-events-all pointer-events-none absolute inset-y-0 z-9999 block px-5 py-3 text-black underline opacity-0 focus:relative focus:opacity-100"
    href="#main">Skip to content</a
>

{#if browser}
    <ClientScss />
{/if}
{@render children()}

<Sprite />

<style lang="scss">
    :global(html) {
        color-scheme: dark;
    }
</style>
