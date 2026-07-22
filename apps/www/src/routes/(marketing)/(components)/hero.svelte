<script lang="ts">
    import PromptHeroInput from './prompt-hero-input.svelte';
    import { cn } from '$lib/utils/cn';
    import { getBuilderUrl } from '$lib/utils/builder';

    type Props = {
        titlePrefix?: string;
        brand?: string;
        subtitle?: string;
    };

    const {
        titlePrefix = 'Build something',
        brand = 'Indobase',
        subtitle = 'Create apps and websites by chatting with AI — then unlock a real backend when you need auth, database, and storage.'
    }: Props = $props();
</script>

<section class="relative overflow-hidden pt-6 pb-10 md:pt-10 md:pb-16">
    <div
        class={cn('pointer-events-none absolute inset-0 -z-10', 'bg-[#F7FAFD]', 'dark:bg-[#0c0d10]')}
        aria-hidden="true"
    ></div>
    <div
        class={cn(
            'pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(85vh,760px)]',
            'bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(59,143,214,0.22)_0%,transparent_55%),linear-gradient(180deg,#F7FAFD_40%,transparent_100%)]',
            'dark:bg-[radial-gradient(ellipse_70%_50%_at_50%_-5%,rgba(59,143,214,0.14)_0%,transparent_50%),linear-gradient(180deg,#0c0d10_35%,transparent_100%)]'
        )}
        aria-hidden="true"
    ></div>
    <div
        class={cn(
            'pointer-events-none absolute top-[18%] left-1/2 -z-10 h-64 w-[min(90%,520px)] -translate-x-1/2 rounded-full opacity-40 blur-3xl',
            'bg-[radial-gradient(circle,rgba(59,143,214,0.35)_0%,transparent_70%)]',
            'animate-[hero-glow_8s_ease-in-out_infinite]'
        )}
        aria-hidden="true"
    ></div>

    <div class="container mx-auto flex max-w-3xl flex-col items-center gap-8 text-center md:gap-10">
        <a
            href={getBuilderUrl()}
            class={cn(
                'animate-fade-in inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/80 px-3 py-1.5',
                'text-[13px] font-medium text-[#5c5c5c] backdrop-blur-sm transition hover:border-black/15 hover:text-[#0a0a0a]',
                'dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:border-white/20 dark:hover:text-white'
            )}
            style="animation-duration: 700ms"
        >
            <span
                class="rounded-full bg-[#2563EB] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase"
            >
                New
            </span>
            <span>AI Builder + Indobase Studio backend</span>
            <span aria-hidden="true">→</span>
        </a>

        <div
            class="animate-fade-in flex flex-col gap-4"
            style="animation-delay: 80ms; animation-duration: 800ms"
        >
            <h1
                class="font-aeonik-pro text-pretty text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.05] font-medium tracking-[-0.03em] text-[#0a0a0a] dark:text-white"
            >
                {titlePrefix}
                <span class="text-[#C47A1A] dark:text-[#3b8fd6]">{brand}</span>
            </h1>

            <p
                class="mx-auto max-w-xl text-lg font-medium text-pretty text-[#5c5c5c] md:text-xl dark:text-white/60"
            >
                {subtitle}
            </p>
        </div>

        <div
            class="animate-fade-in w-full max-w-2xl"
            style="animation-delay: 160ms; animation-duration: 900ms"
        >
            <PromptHeroInput />
        </div>

        <p
            class="animate-fade-in text-sm font-medium text-[#8a8a8a] dark:text-white/40"
            style="animation-delay: 240ms; animation-duration: 900ms"
        >
            Teams across India ship with Indobase
        </p>
    </div>
</section>

<style>
    @keyframes hero-glow {
        0%,
        100% {
            opacity: 0.35;
            transform: translateX(-50%) scale(1);
        }
        50% {
            opacity: 0.55;
            transform: translateX(-50%) scale(1.08);
        }
    }
</style>
