<script lang="ts">
    const stats = [
        {
            value: 'Builder',
            label: 'Chat-to-app in the browser with live Vite preview'
        },
        {
            value: 'Studio',
            label: 'Auth, Database, Storage & Functions when you go Pro'
        },
        {
            value: 'India',
            label: 'INR pricing, DPDP-minded platform, data residency path'
        }
    ] as const;
</script>

<section class="relative overflow-hidden py-20 md:py-28">
    <div
        class="pointer-events-none absolute inset-0 -z-10 bg-[#F7FAFD] dark:bg-[#0c0d10]"
        aria-hidden="true"
    ></div>

    <div class="container mx-auto flex flex-col gap-12 md:gap-16">
        <div class="mx-auto max-w-2xl text-center">
            <h2
                class="font-aeonik-pro text-[clamp(2rem,4vw,3rem)] leading-tight font-medium tracking-[-0.02em] text-[#0a0a0a] dark:text-white"
            >
                <!--
                    Was "Indobase in numbers", but the three stats below are words (Builder /
                    Studio / India), not figures — the heading promised metrics we do not publish.
                    Retitled to match what the section actually shows.
                -->
                What you get with <span class="text-[#3b8fd6]">Indobase</span>
            </h2>
            <p class="mt-3 text-base font-medium text-[#5c5c5c] md:text-lg dark:text-white/55">
                An AI builder with a real backend — built for Indian founders and SMBs.
            </p>
        </div>

        <div class="mx-auto grid w-full max-w-5xl gap-8 sm:grid-cols-3 sm:gap-6">
            {#each stats as stat (stat.value)}
                <div class="flex flex-col items-center gap-3 text-center">
                    <p
                        class="font-aeonik-pro text-[clamp(2.5rem,5vw,3.75rem)] leading-none font-medium tracking-[-0.03em] text-[#3b8fd6]"
                    >
                        {stat.value}
                    </p>
                    <p
                        class="max-w-[220px] text-sm leading-relaxed font-medium text-[#5c5c5c] md:text-[15px] dark:text-white/55"
                    >
                        {stat.label}
                    </p>
                </div>
            {/each}
        </div>
    </div>
</section>
