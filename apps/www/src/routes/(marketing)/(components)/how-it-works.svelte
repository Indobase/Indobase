<script lang="ts">
    import { cn } from '$lib/utils/cn';

    const steps = [
        {
            id: 'idea',
            title: 'Start with an idea',
            description:
                'Describe the app or website you want to create — a landing page, dashboard, CRM, or internal tool.',
            visual: 'prompt' as const
        },
        {
            id: 'life',
            title: 'Watch it come to life',
            description:
                'See your vision transform into a working Vite app in the browser as Indobase Builder generates it live.',
            visual: 'preview' as const
        },
        {
            id: 'ship',
            title: 'Refine and ship',
            description:
                'Iterate with simple feedback, publish to *.indobase.in, and open Studio when you need auth, database, or storage.',
            visual: 'ship' as const
        }
    ] as const;

    let active = $state(0);

    function select(index: number) {
        active = index;
    }
</script>

<section class="relative overflow-hidden py-20 md:py-28">
    <div
        class="pointer-events-none absolute inset-0 -z-10 bg-[#F7FAFD] dark:bg-[#0c0d10]"
        aria-hidden="true"
    ></div>

    <div class="container mx-auto flex flex-col gap-12 md:gap-16">
        <h2
            class="font-aeonik-pro text-center text-[clamp(2rem,4vw,3.25rem)] leading-tight font-medium tracking-[-0.02em] text-[#0a0a0a] dark:text-white"
        >
            Meet <span class="text-[#C47A1A] dark:text-[#3b8fd6]">Indobase</span>
        </h2>

        <div class="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div
                class={cn(
                    'relative aspect-[4/3] overflow-hidden rounded-[28px] border border-black/[0.06]',
                    'bg-[#ECEAE6] dark:border-white/10 dark:bg-[#14161b]'
                )}
            >
                {#if steps[active].visual === 'prompt'}
                    <div
                        class="absolute inset-0 flex animate-[panel-in_420ms_ease-out] items-center justify-center p-8"
                    >
                        <div
                            class="w-full max-w-md rounded-2xl border border-black/5 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1c1f26]"
                        >
                            <p
                                class="mb-3 text-xs font-medium tracking-wide text-[#8a8a8a] uppercase dark:text-white/40"
                            >
                                Prompt
                            </p>
                            <p
                                class="text-left text-[15px] leading-relaxed font-medium text-[#0a0a0a] dark:text-white"
                            >
                                Create a customer feedback tool with AI-powered analysis and a clean
                                dashboard.
                            </p>
                            <div class="mt-5 flex justify-end">
                                <span
                                    class="inline-flex size-10 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg"
                                    aria-hidden="true"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2.5"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path d="m5 12 7-7 7 7" />
                                        <path d="M12 19V5" />
                                    </svg>
                                </span>
                            </div>
                        </div>
                    </div>
                {:else if steps[active].visual === 'preview'}
                    <div
                        class="absolute inset-0 flex animate-[panel-in_420ms_ease-out] flex-col p-5 sm:p-6"
                    >
                        <div
                            class="flex flex-1 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-lg dark:border-white/10 dark:bg-[#1c1f26]"
                        >
                            <div
                                class="flex items-center gap-2 border-b border-black/5 px-4 py-2.5 dark:border-white/10"
                            >
                                <span class="size-2.5 rounded-full bg-[#FF5F57]"></span>
                                <span class="size-2.5 rounded-full bg-[#FEBC2E]"></span>
                                <span class="size-2.5 rounded-full bg-[#28C840]"></span>
                                <span class="ml-2 text-xs font-medium text-[#8a8a8a] dark:text-white/40"
                                    >preview — localhost:5173</span
                                >
                            </div>
                            <div class="grid flex-1 gap-3 p-4 sm:grid-cols-3">
                                <div
                                    class="rounded-xl bg-gradient-to-br from-sky-100 to-blue-200/80 p-3 dark:from-sky-900/40 dark:to-blue-900/30 sm:col-span-2"
                                >
                                    <div class="mb-2 h-2 w-24 rounded bg-black/15 dark:bg-white/20"></div>
                                    <div class="h-2 w-40 rounded bg-black/10 dark:bg-white/10"></div>
                                    <div class="mt-4 h-16 rounded-lg bg-white/50 dark:bg-white/5"></div>
                                </div>
                                <div class="flex flex-col gap-2">
                                    <div class="h-14 flex-1 rounded-xl bg-black/[0.04] dark:bg-white/5"></div>
                                    <div class="h-14 flex-1 rounded-xl bg-black/[0.04] dark:bg-white/5"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                {:else}
                    <div
                        class="absolute inset-0 flex animate-[panel-in_420ms_ease-out] items-center justify-center p-8"
                    >
                        <div class="flex w-full max-w-sm flex-col gap-3">
                            <div
                                class="rounded-2xl border border-black/5 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-[#1c1f26]"
                            >
                                <p class="text-xs font-medium text-[#8a8a8a] uppercase dark:text-white/40">
                                    Published
                                </p>
                                <p class="mt-1 font-semibold text-[#0a0a0a] dark:text-white">
                                    app.indobase.in
                                </p>
                                <div
                                    class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                                >
                                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                                    Live
                                </div>
                            </div>
                            <div
                                class="rounded-2xl border border-black/5 bg-white/80 p-4 dark:border-white/10 dark:bg-[#1c1f26]/80"
                            >
                                <p class="text-xs font-medium text-[#8a8a8a] uppercase dark:text-white/40">
                                    Studio
                                </p>
                                <p class="mt-1 text-sm font-medium text-[#0a0a0a] dark:text-white">
                                    Auth · Database · Storage · Functions
                                </p>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>

            <div class="flex flex-col" role="tablist" aria-label="How Indobase works">
                {#each steps as step, index (step.id)}
                    <button
                        type="button"
                        role="tab"
                        aria-selected={active === index}
                        class={cn(
                            'border-b border-black/[0.06] py-6 text-left transition-opacity duration-300 last:border-b-0 dark:border-white/10',
                            active === index ? 'opacity-100' : 'opacity-35 hover:opacity-65'
                        )}
                        onclick={() => select(index)}
                    >
                        <h3
                            class="font-aeonik-pro mb-2 text-xl font-medium tracking-tight text-[#0a0a0a] md:text-2xl dark:text-white"
                        >
                            {step.title}
                        </h3>
                        <p class="text-[15px] leading-relaxed text-[#5c5c5c] md:text-base dark:text-white/55">
                            {step.description}
                        </p>
                    </button>
                {/each}
            </div>
        </div>
    </div>
</section>

<style>
    @keyframes panel-in {
        from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
</style>
