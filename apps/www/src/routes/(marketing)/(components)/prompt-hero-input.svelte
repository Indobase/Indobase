<script lang="ts">
    import { trackEvent } from '$lib/actions/analytics';
    import { getBuilderUrl } from '$lib/utils/builder';
    import { cn } from '$lib/utils/cn';

    type Props = {
        id?: string;
        eventPrefix?: string;
        placeholder?: string;
        class?: string;
        compact?: boolean;
    };

    const {
        id = 'hero-prompt',
        eventPrefix = 'home-hero',
        placeholder = 'Ask Indobase to create a landing page for my…',
        class: className,
        compact = false
    }: Props = $props();

    let prompt = $state('');

    const examples = [
        'A bookstore landing page with featured books and newsletter signup',
        'A team dashboard with projects, tasks, and activity feed',
        'A waitlist page for my startup with email capture'
    ] as const;

    let exampleIndex = $state(0);

    function cycleExample() {
        exampleIndex = (exampleIndex + 1) % examples.length;
        prompt = examples[exampleIndex];
    }

    function submit() {
        const trimmed = prompt.trim();
        if (!trimmed) return;

        trackEvent(`${eventPrefix}-build-click`);
        window.location.href = getBuilderUrl({ prompt: trimmed, autostart: true });
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
        }
    }
</script>

<div class={cn('flex w-full flex-col gap-3', className)}>
    <div
        class={cn(
            'group relative flex flex-col rounded-[28px] border border-black/[0.06] bg-white',
            'shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-28px_rgba(0,0,0,0.28)]',
            'transition-[box-shadow,transform] duration-500 ease-out',
            'hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_32px_64px_-28px_rgba(0,0,0,0.32)]',
            'dark:border-white/10 dark:bg-[#16181d] dark:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.65)]',
            compact ? 'p-4' : 'p-5 sm:p-6'
        )}
    >
        <label class="sr-only" for={id}>Describe your app</label>
        <textarea
            {id}
            bind:value={prompt}
            rows={compact ? 2 : 3}
            {placeholder}
            class={cn(
                'w-full resize-none border-0 bg-transparent text-[#0a0a0a] outline-none',
                'placeholder:text-[#8a8a8a] focus:ring-0 dark:text-white dark:placeholder:text-white/40',
                compact
                    ? 'min-h-[4rem] text-[15px] leading-relaxed'
                    : 'min-h-[5.5rem] text-base leading-relaxed sm:text-lg'
            )}
            onkeydown={onKeydown}
        ></textarea>

        <div class="mt-3 flex items-center justify-between gap-3">
            <button
                type="button"
                class="text-sm font-medium text-[#6b6b6b] underline-offset-2 transition-colors hover:text-[#0a0a0a] hover:underline dark:text-white/50 dark:hover:text-white"
                onclick={cycleExample}
            >
                Try an example
            </button>

            <button
                type="button"
                class={cn(
                    'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all',
                    /*
                     * This input now only renders in the closing "Ready to build?" section, which
                     * sits on a light ground in the blue brand palette — so the button stays
                     * near-black rather than the hero's purple, which would be a lone purple
                     * element outside the cloud.
                     */
                    prompt.trim()
                        ? 'bg-[#0a0a0a] text-white hover:opacity-90'
                        : 'cursor-not-allowed bg-black/5 text-[#9a9a9a]'
                )}
                disabled={!prompt.trim()}
                onclick={submit}
            >
                Build
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                </svg>
            </button>
        </div>
    </div>

    <p class="text-center text-xs font-medium tracking-wide text-[#8a8a8a] dark:text-white/40">
        ⌘↵ to build · Free includes Builder · Studio unlocks on Pro
    </p>
</div>
