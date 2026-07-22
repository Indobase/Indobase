<script lang="ts">
    import { getSignUpUrl } from '$lib/utils/dashboard';
    import { trackEvent } from '$lib/actions/analytics';
    import { cn } from '$lib/utils/cn';

    /*
     * Some "features" are actually exclusions — every row rendered the same blue tick, so a
     * limitation read as an included benefit. These get a muted dash instead, so a prospect cannot
     * come away thinking Free or Basic include Studio.
     *
     * Listed explicitly rather than pattern-matched on a leading "No": Studio's "No idle sleep" is
     * a premium benefit (apps stay warm), and a heuristic marks it as a limitation — inverting the
     * meaning of the top tier's headline perk. Add new exclusions here by hand.
     */
    const EXCLUDED_FEATURES = new Set(['Builder only (no Studio)', 'No Studio (upgrade to Pro)']);
    const isExclusion = (feature: string) => EXCLUDED_FEATURES.has(feature.trim());

    const plans: Array<{
        id: string;
        name: string;
        price: string;
        description: string;
        tag?: string;
        subtitle?: string;
        event: string;
        features?: string[];
        buttonText: string;
    }> = [
        {
            id: 'Free',
            name: 'Free',
            price: '₹0',
            description: 'Try Builder:',
            event: 'home-pricing-cards-free-click',
            buttonText: 'Start free',
            subtitle: '/ month',
            features: [
                'Builder only (no Studio)',
                '1 app',
                '*.indobase.in subdomain',
                'Indobase badge',
                '5 Builder prompts',
                'Community support'
            ]
        },
        {
            id: 'Basic',
            name: 'Basic',
            price: '₹499',
            description: 'Custom domain + vanity:',
            event: 'home-pricing-cards-basic-click',
            buttonText: 'Get Basic',
            subtitle: '/ month',
            features: [
                'Everything in Free',
                'Custom domain',
                'Badge removed',
                'Frontend / static focus',
                'No Studio (upgrade to Pro)',
                'Email support (48h)'
            ]
        },
        {
            id: 'Pro',
            name: 'Pro',
            price: '₹1,999',
            description: 'Studio unlocked:',
            tag: 'Popular',
            event: 'home-pricing-cards-pro-click',
            buttonText: 'Get Pro',
            subtitle: '/ month',
            features: [
                'Studio unlocked',
                'Auth, Database, Storage, Functions',
                '5 apps',
                'Isolated tenant stack',
                'GitHub export',
                '7-day backups'
            ]
        },
        {
            id: 'Studio',
            name: 'Studio',
            price: '₹6,999',
            description: 'Team — seats & shared billing:',
            event: 'home-pricing-cards-studio-click',
            buttonText: 'Get Studio',
            subtitle: '/ month',
            features: [
                'Everything in Pro',
                '15 apps · 3 seats',
                'Shared billing',
                'No idle sleep',
                'Priority build queue',
                'Priority support'
            ]
        },
        {
            id: 'Enterprise',
            name: 'Enterprise',
            price: 'Custom',
            description: 'From ₹40,000/mo:',
            event: 'home-pricing-cards-enterprise-click',
            buttonText: 'Contact Us',
            features: [
                'DPDP audit pack',
                'Uptime SLA',
                'Dedicated placement / VPC',
                'SSO',
                '24×7 premium support'
            ]
        }
    ];

    type PricingProps = {
        class?: string;
    };

    const { class: className }: PricingProps = $props();

    const DASHBOARD_URL = getSignUpUrl();
</script>

<section
    class={cn(
        'relative overflow-hidden bg-[#111113] py-24 md:py-32',
        className
    )}
>
    <div
        class={cn(
            'pointer-events-none absolute top-0 left-1/2 -z-0 h-[420px] w-[min(100%,900px)] -translate-x-1/2',
            'bg-[radial-gradient(ellipse_at_center,rgba(59, 143, 214,0.18)_0%,transparent_65%)]'
        )}
        aria-hidden="true"
    ></div>

    <div class="container relative z-10 flex w-full flex-col items-center gap-12">
        <div class="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <h2
                class="font-aeonik-pro text-[clamp(2rem,4vw,3.25rem)] leading-tight font-medium tracking-[-0.02em] text-[#3b8fd6]"
            >
                Simple INR pricing
            </h2>
            <p class="text-lg font-medium text-white/70">
                Free to try Builder. Pro unlocks Studio. Scale when you need seats.
            </p>
            <a
                href={DASHBOARD_URL}
                class="mt-2 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                onclick={() => trackEvent('pricing-get-started-click')}
            >
                Start building for free
            </a>
        </div>

        <div
            class="grid w-full max-w-[1280px] grid-cols-1 overflow-hidden rounded-[28px] border border-white/8 bg-[#1a1a1c] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        >
            {#each plans as { id, name, price, tag: label, subtitle, description, event, features, buttonText }, index (`${id},${label},${index}`)}
                {@const isEnterprise = id === 'Enterprise'}
                {@const isPopular = id === 'Pro'}
                <div
                    class={cn(
                        'flex flex-col gap-1 px-5 py-8 border-b border-white/5 xl:border-b-0',
                        index !== plans.length - 1 ? 'xl:border-r xl:border-white/5' : '',
                        isPopular ? 'bg-white/[0.03]' : ''
                    )}
                >
                    <div class="flex items-center gap-2.5">
                        <span class="text-lg leading-none font-medium tracking-normal text-white"
                            >{name}</span
                        >
                        {#if label}
                            <span
                                class="rounded-full bg-[#3b8fd6]/20 px-2 py-0.5 text-[11px] font-semibold text-[#3b8fd6]"
                                >{label}</span
                            >
                        {/if}
                    </div>
                    <div class="flex flex-1 flex-col">
                        <span
                            class="mt-4 mb-4 flex items-baseline gap-1 font-sans text-[2.25rem] font-medium tracking-tight text-[#3b8fd6]"
                        >
                            {price}
                            {#if subtitle}
                                <span class="text-[14px] font-normal text-white/50">{subtitle}</span>
                            {/if}
                        </span>

                        <p class="mb-5 block text-[13px] leading-snug font-medium text-white/60">
                            {description}
                        </p>

                        {#if features && features.length > 0}
                            <ul class="mb-8 flex flex-col gap-2.5 text-[13px] font-normal text-white/80">
                                {#each features as feature}
                                    {@const excluded = isExclusion(feature)}
                                    <li class="flex items-start gap-2.5">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="1.5"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            class={cn(
                                                'mt-[1px] h-4 w-4 shrink-0',
                                                excluded ? 'text-white/35' : 'text-[#3b8fd6]'
                                            )}
                                            aria-hidden="true"
                                            >{#if excluded}<path d="M5 12h14" />{:else}<path
                                                    d="M20 6 9 17l-5-5"
                                                />{/if}</svg
                                        >
                                        <span
                                            class={cn(
                                                'flex-1 leading-snug tracking-normal',
                                                excluded ? 'text-white/45' : ''
                                            )}>{feature}</span
                                        >
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>

                    <a
                        href={isEnterprise ? '/contact-us/enterprise' : DASHBOARD_URL}
                        onclick={() => trackEvent(event)}
                        class={cn(
                            'mt-auto flex w-full items-center justify-center rounded-full px-4 py-2.5 text-[14px] font-semibold transition-all',
                            isEnterprise
                                ? 'border border-white/15 text-white hover:bg-white/5'
                                : isPopular
                                  ? 'bg-[#3b8fd6] text-black hover:opacity-90'
                                  : 'bg-white text-black hover:opacity-90'
                        )}
                    >
                        {buttonText}
                    </a>
                </div>
            {/each}
        </div>
    </div>
</section>
