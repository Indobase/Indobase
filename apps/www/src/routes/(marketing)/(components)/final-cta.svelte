<script lang="ts">
    import PromptHeroInput from './prompt-hero-input.svelte';
</script>

<section class="relative overflow-hidden py-24 md:py-32">
    <div
        class="pointer-events-none absolute inset-0 -z-10 bg-[#F7FAFD] dark:bg-[#0c0d10]"
        aria-hidden="true"
    ></div>
    <div
        class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-64 bg-[radial-gradient(ellipse_60%_80%_at_50%_100%,rgba(59,143,214,0.18)_0%,transparent_70%)]"
        aria-hidden="true"
    ></div>

    <div class="container mx-auto flex max-w-2xl flex-col items-center gap-6 text-center md:gap-8">
        <h2
            class="font-aeonik-pro text-[clamp(2.25rem,5vw,3.5rem)] leading-tight font-medium tracking-[-0.03em] text-[#0a0a0a] dark:text-white"
        >
            Ready to build?
        </h2>
        <p class="text-base font-medium text-[#5c5c5c] md:text-lg dark:text-white/55">
            Describe your app once. Indobase handles codegen, preview, and publish.
        </p>
        <div class="w-full">
            <PromptHeroInput id="final-prompt" eventPrefix="home-final" compact />
        </div>
    </div>
</section>
