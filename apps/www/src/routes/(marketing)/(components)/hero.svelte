<script lang="ts">
    import { cn } from '$lib/utils/cn';
    import { getSignUpUrl } from '$lib/utils/dashboard';
    import { trackEvent } from '$lib/actions/analytics';

    type Props = {
        titlePrefix?: string;
        brand?: string;
        subtitle?: string;
    };

    const {
        titlePrefix = 'Launch Your Business using',
        brand = 'Indobase',
        subtitle = 'Describe what you want and Indobase builds it — a working app with auth, database, and storage, ready to publish.'
    }: Props = $props();

    /*
     * Floating tiles: the pieces of a business Indobase is used to build — storefront, payments,
     * invoicing, customers, orders, analytics, support, payouts.
     *
     * Drawn inline as generic concept icons rather than third-party marks (Shopify, PayPal, Slack
     * and friends). Those would read as an integrations strip and imply partnerships Indobase does
     * not ship — a claim the page cannot support. Concepts say the same thing honestly.
     *
     * `pos` keeps every tile outside the centre column so none ever sits over the headline or the
     * CTA. They are decoration, and the container is aria-hidden.
     */
    const tiles = [
        { name: 'Storefront', pos: 'left-[6%] top-[20%]', delay: '0s' },
        { name: 'Payments', pos: 'left-[13%] top-[58%]', delay: '1.1s' },
        { name: 'Invoicing', pos: 'left-[8%] top-[82%]', delay: '2.2s' },
        { name: 'Customers', pos: 'left-[26%] top-[8%]', delay: '0.6s' },
        { name: 'Analytics', pos: 'right-[7%] top-[17%]', delay: '1.7s' },
        { name: 'Orders', pos: 'right-[13%] top-[54%]', delay: '0.3s' },
        { name: 'Support', pos: 'right-[6%] top-[80%]', delay: '2.6s' },
        { name: 'Payouts', pos: 'right-[27%] top-[7%]', delay: '1.4s' }
    ] as const;
</script>

<!--
    min-h keeps the cloud and the floating tiles in proportion. Without the prompt box the copy is
    only ~360px tall, and since the tiles are positioned as a percentage of the section they would
    collapse inward and crowd the headline.
-->
<section
    class="hero-cloud relative isolate flex min-h-[620px] items-center overflow-hidden pt-14 pb-20 md:min-h-[720px] md:pt-20 md:pb-28"
>
    <!-- Pastel cloud field. Layered soft radials + two blurred puffs give the billowing edge. -->
    <div class="cloud-base pointer-events-none absolute inset-0 -z-20" aria-hidden="true"></div>
    <div class="cloud-puff cloud-puff-a pointer-events-none absolute -z-10" aria-hidden="true"></div>
    <div class="cloud-puff cloud-puff-b pointer-events-none absolute -z-10" aria-hidden="true"></div>

    <!-- Floating business tiles: decorative, shown only where there is room not to crowd the copy. -->
    <div class="pointer-events-none absolute inset-0 -z-10 hidden lg:block" aria-hidden="true">
        {#each tiles as tile (tile.name)}
            <div
                class={cn('tile absolute grid size-14 place-items-center rounded-2xl bg-white', tile.pos)}
                style="animation-delay:{tile.delay}"
            >
                {#if tile.name === 'Storefront'}
                    <svg viewBox="0 0 24 24" class="size-7" aria-hidden="true">
                        <path d="M3 4h18l-1 4a3 3 0 0 1-5.6.7 3 3 0 0 1-4.8 0A3 3 0 0 1 4 8L3 4Z" fill="#F97316" />
                        <path d="M5 11v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" stroke="#EA580C" stroke-width="1.8" fill="none" stroke-linecap="round" />
                        <rect x="9" y="13.5" width="6" height="6.5" rx="1" fill="#FDBA74" />
                    </svg>
                {:else if tile.name === 'Payments'}
                    <svg viewBox="0 0 24 24" class="size-7" aria-hidden="true">
                        <rect x="2" y="5" width="20" height="14" rx="2.5" fill="#4F46E5" />
                        <rect x="2" y="8.5" width="20" height="3" fill="#312E81" />
                        <rect x="5" y="14" width="6" height="2" rx="1" fill="#C7D2FE" />
                    </svg>
                {:else if tile.name === 'Invoicing'}
                    <svg viewBox="0 0 24 24" class="size-7" aria-hidden="true">
                        <path d="M5 2.5h11l3.5 3.5v15l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3V2.5Z" fill="#0EA5E9" />
                        <path d="M9 7.5h6M9 11h6M9 14.5h3.5" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" />
                    </svg>
                {:else if tile.name === 'Customers'}
                    <svg viewBox="0 0 24 24" class="size-7" aria-hidden="true">
                        <circle cx="9" cy="8" r="3.6" fill="#0891B2" />
                        <path d="M2.5 20a6.5 6.5 0 0 1 13 0Z" fill="#22D3EE" />
                        <circle cx="17" cy="9" r="2.8" fill="#0E7490" />
                        <path d="M13.6 20a4.9 4.9 0 0 1 8.4-3.4A4.9 4.9 0 0 1 23 20Z" fill="#67E8F9" />
                    </svg>
                {:else if tile.name === 'Analytics'}
                    <svg viewBox="0 0 24 24" class="size-7" aria-hidden="true">
                        <rect x="3" y="13" width="4.4" height="8" rx="1.2" fill="#C4B5FD" />
                        <rect x="9.8" y="8" width="4.4" height="13" rx="1.2" fill="#8B5CF6" />
                        <rect x="16.6" y="3.5" width="4.4" height="17.5" rx="1.2" fill="#6D28D9" />
                    </svg>
                {:else if tile.name === 'Orders'}
                    <svg viewBox="0 0 24 24" class="size-7" aria-hidden="true">
                        <path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z" fill="#F59E0B" />
                        <path d="M3 7l9 4.5L21 7" stroke="#FFFFFF" stroke-width="1.6" fill="none" stroke-linejoin="round" />
                        <path d="M12 11.5V21" stroke="#FFFFFF" stroke-width="1.6" fill="none" />
                    </svg>
                {:else if tile.name === 'Support'}
                    <svg viewBox="0 0 24 24" class="size-7" aria-hidden="true">
                        <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.6 3.4A.6.6 0 0 1 3.5 20l.3-3.2A2.5 2.5 0 0 1 3 14.5v-8Z" fill="#10B981" />
                        <circle cx="8.5" cy="10.5" r="1.3" fill="#FFFFFF" />
                        <circle cx="12" cy="10.5" r="1.3" fill="#FFFFFF" />
                        <circle cx="15.5" cy="10.5" r="1.3" fill="#FFFFFF" />
                    </svg>
                {:else}
                    <svg viewBox="0 0 24 24" class="size-7" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" fill="#DB2777" />
                        <path d="M9 7h6M9 10h6M14.2 7c1.4 0 2.3 1 2.3 2.3S15.6 11.6 14 11.6H9.6L15 17"
                              stroke="#FFFFFF" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                {/if}
            </div>
        {/each}
    </div>

    <div class="container mx-auto flex max-w-3xl flex-col items-center gap-8 text-center md:gap-10">
        <div
            class="animate-fade-in flex flex-col gap-4"
            style="animation-delay: 80ms; animation-duration: 800ms"
        >
            <h1
                class="font-aeonik-pro text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.05] font-medium tracking-[-0.03em] text-pretty text-[#221a2e]"
            >
                {titlePrefix}
                <span class="brand-gradient">{brand}</span>
            </h1>

            <p
                class="mx-auto max-w-xl text-lg font-medium text-pretty text-[#4a4458] md:text-xl"
            >
                {subtitle}
            </p>
        </div>

        <!--
            Goes to Studio (studio.indobase.in) rather than Builder: getSignUpUrl() is the same
            helper behind the header's "Start building for free", so both primary CTAs land on the
            same sign-up → plan-selection flow instead of splitting traffic between two products.
        -->
        <a
            href={getSignUpUrl()}
            onclick={() => trackEvent('home-hero-start_building-click')}
            class={cn(
                'animate-fade-in inline-flex items-center gap-2 rounded-full bg-[#A21CAF] px-7 py-3.5',
                'text-[15px] font-semibold text-white shadow-[0_10px_26px_-8px_rgba(162,28,175,0.6)]',
                'transition hover:bg-[#8E1799] hover:shadow-[0_14px_32px_-8px_rgba(162,28,175,0.7)]'
            )}
            style="animation-delay: 160ms; animation-duration: 900ms"
        >
            Start building free
            <span aria-hidden="true">&rarr;</span>
        </a>

        <ul
            class="animate-fade-in flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-medium text-[#5a5468]"
            style="animation-delay: 240ms; animation-duration: 900ms"
        >
            <li>Vite + React output</li>
            <li class="text-[#b9aec9]" aria-hidden="true">&bull;</li>
            <li>Live preview in the browser</li>
            <li class="text-[#b9aec9]" aria-hidden="true">&bull;</li>
            <li>Postgres, Auth &amp; Storage on Pro</li>
            <li class="text-[#b9aec9]" aria-hidden="true">&bull;</li>
            <li>Billed in INR</li>
        </ul>
    </div>
</section>

<style>
    /*
     * The cloud is CSS rather than an image: it has to stretch from 375px to ultrawide without
     * banding or a fixed focal point, and a gradient stack rescales cleanly where a bitmap would
     * either tile or blur.
     */
    .cloud-base {
        background:
            radial-gradient(58% 46% at 18% 26%, rgba(186, 148, 255, 0.62) 0%, transparent 62%),
            radial-gradient(52% 42% at 78% 20%, rgba(255, 170, 214, 0.6) 0%, transparent 62%),
            radial-gradient(56% 48% at 64% 74%, rgba(255, 199, 162, 0.55) 0%, transparent 64%),
            radial-gradient(48% 42% at 26% 82%, rgba(167, 152, 255, 0.5) 0%, transparent 62%),
            radial-gradient(40% 34% at 50% 46%, rgba(255, 255, 255, 0.55) 0%, transparent 70%),
            linear-gradient(180deg, #f3ecff 0%, #fdf1f6 46%, #fff7f1 74%, #ffffff 100%);
    }

    .cloud-puff {
        border-radius: 50%;
        filter: blur(60px);
        opacity: 0.75;
    }

    .cloud-puff-a {
        top: 6%;
        left: -8%;
        width: min(60%, 620px);
        height: 320px;
        background: radial-gradient(circle, rgba(196, 160, 255, 0.75) 0%, transparent 70%);
    }

    .cloud-puff-b {
        right: -6%;
        bottom: 2%;
        width: min(55%, 560px);
        height: 300px;
        background: radial-gradient(circle, rgba(255, 186, 190, 0.7) 0%, transparent 70%);
    }

    .brand-gradient {
        background: linear-gradient(96deg, #a855f7 0%, #e879f9 46%, #fb923c 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }

    .tile {
        box-shadow:
            0 10px 28px -8px rgba(88, 44, 130, 0.28),
            0 2px 6px -1px rgba(88, 44, 130, 0.12);
        animation: tile-float 9s ease-in-out infinite;
    }

    @keyframes tile-float {
        0%,
        100% {
            transform: translateY(0) rotate(-2deg);
        }
        50% {
            transform: translateY(-14px) rotate(2deg);
        }
    }

    /* Ambient drift is decoration, so it is the first thing to go when motion is unwelcome. */
    @media (prefers-reduced-motion: reduce) {
        .tile {
            animation: none;
        }
    }
</style>
