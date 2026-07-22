<script lang="ts">
    import { getBuilderUrl } from '$lib/utils/builder';
    import { getSignUpUrl } from '$lib/utils/dashboard';
    import { trackEvent } from '$lib/actions/analytics';
    import { cn } from '$lib/utils/cn';

    const pillars = [
        {
            title: 'Builder',
            body: 'Describe an app. Get a live preview. Publish to your Indobase subdomain in one click.',
            href: getBuilderUrl(),
            event: 'home-edge-builder-click',
            cta: 'Open Builder'
        },
        {
            title: 'Studio',
            body: 'When you need auth, Postgres, storage, or edge functions — Studio unlocks on Pro.',
            href: getSignUpUrl(),
            event: 'home-edge-studio-click',
            cta: 'Open Studio'
        }
    ] as const;
</script>

<section class="relative overflow-hidden py-20 md:py-28">
    <div
        class="pointer-events-none absolute inset-0 -z-10 bg-white dark:bg-[#0c0d10]"
        aria-hidden="true"
    ></div>

    <div class="container mx-auto flex flex-col gap-10 md:gap-14">
        <div class="mx-auto max-w-2xl text-center">
            <h2
                class="font-aeonik-pro text-[clamp(2rem,4vw,3rem)] leading-tight font-medium tracking-[-0.02em] text-pretty text-[#0a0a0a] dark:text-white"
            >
                Not just a prototype — a full stack
            </h2>
            <p class="mt-3 text-base font-medium text-[#5c5c5c] md:text-lg dark:text-white/55">
                Chat to ship a frontend — then attach auth, database, and storage when you need them.
            </p>
        </div>

        <div class="mx-auto grid w-full max-w-4xl gap-4 md:grid-cols-2">
            {#each pillars as pillar (pillar.title)}
                <a
                    href={pillar.href}
                    class={cn(
                        'group flex flex-col gap-4 rounded-[28px] border border-black/[0.06] bg-[#F7FAFD] p-8',
                        'transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-28px_rgba(0,0,0,0.3)]',
                        'dark:border-white/10 dark:bg-[#14161b]'
                    )}
                    onclick={() => trackEvent(pillar.event)}
                >
                    <h3
                        class="font-aeonik-pro text-2xl font-medium tracking-tight text-[#0a0a0a] dark:text-white"
                    >
                        {pillar.title}
                    </h3>
                    <p class="flex-1 text-[15px] leading-relaxed text-[#5c5c5c] dark:text-white/55">
                        {pillar.body}
                    </p>
                    <span
                        class="inline-flex items-center gap-1 text-sm font-semibold text-[#0a0a0a] dark:text-white"
                    >
                        {pillar.cta}
                        <span
                            class="transition-transform group-hover:translate-x-0.5"
                            aria-hidden="true">→</span
                        >
                    </span>
                </a>
            {/each}
        </div>
    </div>
</section>
