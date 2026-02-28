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
    import { isVisible } from '$lib/utils/isVisible';
    import { createScrollInfo } from '$lib/utils/scroll';
    import { addEventListener } from '@melt-ui/svelte/internal/helpers';
    import { onMount } from 'svelte';
    import { getAppwriteDashboardUrl } from '$lib/utils/dashboard';
    import { trackEvent } from '$lib/actions/analytics';
    import MainNav from '$lib/components/MainNav.svelte';
    import { page } from '$app/state';
    import { Button, Icon } from '$lib/components/ui';

    export let omitMainId = false;
    export let hideNavigation = false;
    let theme: 'light' | 'dark' | null = 'dark';

    function setupThemeObserver() {
        const handleVisibility = () => {
            theme = getVisibleTheme();
        };

        const observer = new MutationObserver(handleVisibility);
        observer.observe(document.body, { childList: true, subtree: true });

        const callbacks = [
            addEventListener(window, 'scroll', handleVisibility),
            addEventListener(window, 'resize', handleVisibility)
        ];

        return () => {
            observer.disconnect();
            callbacks.forEach((callback) => callback());
        };
    }

    function isInViewport(element: Element): boolean {
        const mobileHeader = document.querySelector('.aw-mobile-header');
        const isMobile =
            mobileHeader &&
            getComputedStyle(mobileHeader).display !== 'none' &&
            isVisible(mobileHeader, {
                top: 0,
                bottom: window.innerHeight,
                left: 0,
                right: window.innerWidth
            });
        const h = isMobile || 'bannerHidden' in document.body.dataset ? 32 : 64;

        return isVisible(element, {
            top: h,
            bottom: h,
            left: 0,
            right: window.innerWidth
        });
    }

    function getVisibleTheme() {
        const themes = Array.from(document.querySelectorAll('.dark, .light')).filter((element) => {
            const { classList, dataset } = element as HTMLElement;
            if (
                classList.contains('web-mobile-header') ||
                classList.contains('web-main-header') ||
                element === document.body ||
                typeof dataset['themeIgnore'] === 'string'
            ) {
                return false;
            }
            return true;
        });

        for (const theme of themes) {
            if (isInViewport(theme)) {
                return theme.classList.contains('light') ? 'light' : 'dark';
            }
        }

        return 'dark';
    }

    onMount(() => {
        setTimeout(() => {
            $initialized = true;
        }, 1000);
        return setupThemeObserver();
    });

    $: navLinks = [
        { label: 'Pricing', href: '/pricing' },
        { label: 'Contact', href: '/contact-us' },
        { label: 'Terms', href: '/terms' },
        { label: 'Privacy', href: '/privacy' },
        { label: 'Enterprise', href: '/contact-us/enterprise' }
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

    const DASHBOARD_URL = getAppwriteDashboardUrl('/sign-up');

    $: mobileButtonHref = DASHBOARD_URL;
    $: mobileButtonEvent = 'main-start_building_btn-click';
    $: mobileButtonText = 'Start building';

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
                <span class="nav-badge text-sub-body font-medium text-primary">
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
