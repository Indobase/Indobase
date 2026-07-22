<script lang="ts">
    import { trackEvent } from '$lib/actions/analytics';
    import { getBuilderUrl } from '$lib/utils/builder';
    import { cn } from '$lib/utils/cn';

    const starters = [
        {
            id: 'cafe',
            title: 'Maple & Mist Cafe',
            subtitle: 'Editorial cafe storefront with menu and newsletter',
            prompt:
                'Build a cozy cafe landing page called Maple & Mist with a hero, featured drinks, and a newsletter signup. Vite + React + Tailwind.',
            accent: 'from-[#E8D5C4] via-[#F0E6DC] to-[#D4B896]',
            span: 'lg:col-span-2 lg:row-span-2',
            tall: true,
            lightText: false
        },
        {
            id: 'crm',
            title: 'CRM dashboard',
            subtitle: 'Contacts, deals pipeline, activity feed',
            prompt:
                'Build a simple CRM dashboard with contacts, deals pipeline, and an activity feed. Vite + React. Use a clean sidebar layout.',
            accent: 'from-[#C5D4E8] via-[#DCE6F2] to-[#A8BDD8]',
            span: '',
            tall: false,
            lightText: false
        },
        {
            id: 'saas',
            title: 'SaaS landing',
            subtitle: 'Pricing, features, social proof',
            prompt:
                'Build a modern SaaS landing page with hero, feature grid, pricing table, and FAQ. Vite + React + Tailwind.',
            accent: 'from-[#D8D0C8] via-[#E8E2DA] to-[#C4B8A8]',
            span: '',
            tall: false,
            lightText: false
        },
        {
            id: 'store',
            title: 'Online storefront',
            subtitle: 'Product grid, cart UI, checkout CTA',
            prompt:
                'Build an e-commerce storefront with a product grid, product detail modal, and cart drawer. Vite + React.',
            accent: 'from-[#E5C9C4] via-[#F0DDD8] to-[#D4A89E]',
            span: '',
            tall: false,
            lightText: false
        },
        {
            id: 'habit',
            title: 'Habit tracker',
            subtitle: 'Streaks, calendar heatmap, insights',
            prompt:
                'Build a calm habit tracker with streak counters, a calendar heatmap, and motivational insights. Vite + React + Tailwind.',
            accent: 'from-[#C8D9C4] via-[#DCE8D8] to-[#A8C4A0]',
            span: '',
            tall: false,
            lightText: false
        },
        {
            id: 'portfolio',
            title: 'Creative portfolio',
            subtitle: 'Dark-first case studies and contact',
            prompt:
                'Build a dark-first creative portfolio with case study cards, project filters, and a contact section. Vite + React + Tailwind.',
            accent: 'from-[#2A2A2E] via-[#3A3A40] to-[#1A1A1E]',
            span: 'lg:col-span-2',
            tall: false,
            lightText: true
        }
    ] as const;
</script>

<section class="relative overflow-hidden py-20 md:py-28">
    <div
        class="pointer-events-none absolute inset-0 -z-10 bg-white dark:bg-[#0c0d10]"
        aria-hidden="true"
    ></div>

    <div class="container mx-auto flex flex-col gap-10 md:gap-12">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h2
                    class="font-aeonik-pro text-[clamp(2rem,4vw,3rem)] leading-tight font-medium tracking-[-0.02em] text-[#0a0a0a] dark:text-white"
                >
                    Discover templates
                </h2>
                <p class="mt-2 max-w-md text-base font-medium text-[#5c5c5c] md:text-lg dark:text-white/55">
                    Start your next project with a prompt — Builder opens ready to run.
                </p>
            </div>
            <a
                href={getBuilderUrl()}
                class="inline-flex items-center gap-1 text-sm font-semibold text-[#0a0a0a] underline-offset-4 hover:underline dark:text-white"
                onclick={() => trackEvent('home-templates-view-all-click')}
            >
                Open Builder
                <span aria-hidden="true">→</span>
            </a>
        </div>

        <div class="grid auto-rows-[180px] gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[200px]">
            {#each starters as starter (starter.id)}
                <a
                    href={getBuilderUrl({ prompt: starter.prompt, autostart: true })}
                    class={cn(
                        'group relative flex flex-col overflow-hidden rounded-[24px] border border-black/[0.06]',
                        'transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.35)]',
                        'dark:border-white/10',
                        starter.span,
                        starter.tall ? 'row-span-2' : ''
                    )}
                    onclick={() => trackEvent(`home-template-${starter.id}-click`)}
                >
                    <div
                        class={cn(
                            'relative flex flex-1 flex-col justify-end bg-gradient-to-br p-5',
                            starter.accent
                        )}
                    >
                        <div
                            class={cn(
                                'pointer-events-none absolute inset-4 rounded-xl border opacity-40',
                                starter.lightText
                                    ? 'border-white/20 bg-white/5'
                                    : 'border-black/10 bg-white/30'
                            )}
                            aria-hidden="true"
                        ></div>

                        <div class="relative z-10">
                            <h3
                                class={cn(
                                    'font-aeonik-pro text-lg font-medium tracking-tight md:text-xl',
                                    starter.lightText ? 'text-white' : 'text-greyscale-900'
                                )}
                            >
                                {starter.title}
                            </h3>
                            <p
                                class={cn(
                                    'mt-1 text-sm leading-snug',
                                    starter.lightText ? 'text-white/70' : 'text-greyscale-700/80'
                                )}
                            >
                                {starter.subtitle}
                            </p>
                            <span
                                class={cn(
                                    'mt-3 inline-flex items-center gap-1 text-sm font-semibold opacity-0 transition group-hover:opacity-100',
                                    starter.lightText ? 'text-white' : 'text-greyscale-900'
                                )}
                            >
                                Build this
                                <span aria-hidden="true">→</span>
                            </span>
                        </div>
                    </div>
                </a>
            {/each}
        </div>
    </div>
</section>
