<script lang="ts" context="module">
    import { writable } from 'svelte/store';

    export const isHeaderHidden = writable(false);
    export const isMobileNavOpen = writable(false);
    const initialized = writable(false);
</script>

<script lang="ts">
    import { browser } from '$app/environment';
    import { MobileNav, IsLoggedIn } from '$lib/components';
    import { BANNER_KEY } from '$lib/constants';
    import { createScrollInfo } from '$lib/utils/scroll';
    import { onMount } from 'svelte';
    import { getSignUpUrl } from '$lib/utils/dashboard';
    import { getBuilderUrl } from '$lib/utils/builder';
    import MainNav from '$lib/components/MainNav.svelte';
    import { Button, Icon } from '$lib/components/ui';

    export let omitMainId = false;
    export let hideNavigation = false;
    /*
     * The header used to pick its own theme by scanning the page for whichever `.dark`/`.light`
     * section was in view, driven by a MutationObserver on document.body (childList + subtree) plus
     * unthrottled scroll and resize handlers.
     *
     * Two reasons it is gone: the site is light-only now, and the scan explicitly skipped
     * document.body, so with no other themed section on the page it always fell through to its
     * 'dark' fallback — a dark header on a light page. Pinning the value also drops an observer that
     * re-ran on every DOM mutation and every scroll frame.
     */
    const theme: 'light' | 'dark' = 'light';

    onMount(() => {
        setTimeout(() => {
            $initialized = true;
        }, 1000);
    });

    /*
     * Terms and Privacy used to sit here. They are legal boilerplate, not destinations a visitor
     * navigates to while evaluating the product, and both are already linked in the footer next to
     * DPDP and Cookies — so they were spending primary-nav real estate twice over. Builder takes
     * that space instead, since trying the product is the action this page is asking for.
     */
    const navLinks = [
        { label: 'Builder', href: getBuilderUrl() },
        { label: 'Pricing', href: '/pricing' },
        { label: 'Enterprise', href: '/contact-us/enterprise' },
        { label: 'Contact', href: '/contact-us' }
    ];

    $: resolvedTheme = $isMobileNavOpen ? 'dark' : theme;

    const scrollInfo = createScrollInfo();

    $: $isHeaderHidden = (() => {
        if ($scrollInfo.top < 250) {
            return false;
        }
        if ($scrollInfo.direction === 'down') {
            return true;
        }

        return $scrollInfo.deltaDirChange < 200;
    })();

    const mobileButtonHref = getSignUpUrl();
    const mobileButtonEvent = 'main-start_building_btn-click';
    const mobileButtonText = 'Start building';

    const handleNav = () => {
        $isMobileNavOpen = !$isMobileNavOpen;
        document.body.style.overflow = $isMobileNavOpen ? 'hidden' : '';
    };
</script>

<div class="relative contents h-full">
    <section
        class="web-mobile-header flex! lg:hidden! {resolvedTheme}"
        class:is-transparent={browser && !$isMobileNavOpen}
    >
        <div class="web-mobile-header-start">
            <a href="/">
                <img
                    class="web-logo web-u-only-dark"
                    src="/images/logos/indobase.svg"
                    alt="indobase"
                    height="24"
                    width="130"
                />
                <img
                    class="web-logo web-u-only-light"
                    src="/images/logos/indobase-light.svg"
                    alt="indobase"
                    height="24"
                    width="130"
                />
            </a>
        </div>
        <div class="web-mobile-header-end">
            {#if !$isMobileNavOpen}
                <Button href={mobileButtonHref} event={mobileButtonEvent}>
                    <span class="text">{mobileButtonText}</span>
                </Button>
            {/if}
            <Button variant="text" aria-label="open navigation" onclick={handleNav}>
                {#if $isMobileNavOpen}
                    <Icon aria-hidden="true" name="close" />
                {:else}
                    <Icon aria-hidden="true" name="hamburger-menu" />
                {/if}
            </Button>
        </div>
    </section>

    <header
        class="web-main-header is-special-padding hidden lg:block! {resolvedTheme} is-transparent"
    >
        <div
            class="web-main-header-wrapper"
            class:is-special-padding={BANNER_KEY.startsWith('init-banner-')}
        >
            <div class="web-main-header-start">
                <a href="/">
                    <img
                        class="web-logo web-u-only-dark"
                        src="/images/logos/indobase.svg"
                        alt="indobase"
                        height="24"
                        width="130"
                    />
                    <img
                        class="web-logo web-u-only-light"
                        src="/images/logos/indobase-light.svg"
                        alt="indobase"
                        height="24"
                        width="130"
                    />
                </a>
                {#if !hideNavigation}
                    <MainNav initialized={$initialized} links={navLinks} />
                {/if}
            </div>
            <div class="web-main-header-end">
                <span class="nav-badge text-sub-body text-primary font-medium">
                    Made in India
                </span>
                <IsLoggedIn offerButton={false} />
            </div>
        </div>
    </header>
    {#if !hideNavigation}
        <MobileNav bind:open={$isMobileNavOpen} links={navLinks} offerButton={false} />
    {/if}

    <main
        class="relative space-y-6"
        class:invisible={$isMobileNavOpen}
        id={omitMainId ? undefined : 'main'}
    >
        <slot />
    </main>
</div>

<style lang="scss">
    .nav-badge {
        margin-inline-start: 0.5rem;
        padding-inline: 0.375rem;
    }

    @keyframes scale-in {
        0% {
            transform: scale(0);
        }
        100% {
            transform: scale(1);
        }
    }

    .is-special-padding {
        padding-inline: clamp(1.25rem, 4vw, 120rem);
    }
</style>
