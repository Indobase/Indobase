<script lang="ts">
    import { createAccordion, melt } from '@melt-ui/svelte';
    import { slide } from 'svelte/transition';

    export let noBorder = false;

    const {
        elements: { content, heading, item, root, trigger },
        helpers: { isSelected }
    } = createAccordion({
        multiple: true,
        forceVisible: true
    });

    const links: Record<string, { label: string; href: string; target?: string; rel?: string }[]> =
        {
            'Links': [
                { label: 'Pricing', href: '/pricing' },
                { label: 'Contact us', href: '/contact-us' },
                { label: 'Enterprise', href: '/contact-us/enterprise' },
                { label: 'Terms', href: '/terms' },
                { label: 'Privacy', href: '/privacy' }
            ]
        };
</script>

<nav
    aria-label="Footer"
    class="border-smooth relative border-t"
    class:web-u-sep-block-start={!noBorder}
>
    <div class="web-footer-nav container">
        <img
            class="web-logo"
            src="/images/logos/indobase.svg"
            alt="Indobase"
            height="24"
            width="130"
        />
        <ul class="web-footer-nav-main-list" use:melt={$root}>
            {#each Object.entries(links) as [title, items], i (i)}
                <li class="web-footer-nav-main-item web-is-not-mobile">
                    <h2
                        class="web-footer-nav-main-title web-is-not-mobile text-caption font-medium uppercase"
                    >
                        {title}
                    </h2>
                    <ul class="web-footer-nav-secondary-list text-sub-body">
                        {#each items as { href, label, target, rel }, j (j)}
                            <li>
                                <a class="web-link" {href} {target} {rel}>{label}</a>
                            </li>
                        {/each}
                    </ul>
                </li>
                <li
                    class="web-footer-nav-main-item web-is-only-mobile"
                    use:melt={$item({ value: title })}
                >
                    <h5 use:melt={$heading({ level: 5 })}>
                        <button
                            class="web-footer-nav-button web-is-only-mobile"
                            use:melt={$trigger({ value: title })}
                        >
                            <span class="text-caption font-medium uppercase">{title}</span>
                            <span
                                class="web-icon-chevron-down web-u-transition"
                                class:web-u-rotate-180={$isSelected(title)}
                                style:font-size="1rem"
                            ></span>
                        </button>
                    </h5>
                    {#if $isSelected(title)}
                        <ul
                            class="web-footer-nav-secondary-list text-sub-body"
                            use:melt={$content({ value: title })}
                            transition:slide={{ duration: 250 }}
                        >
                            {#each items as { href, label, target, rel }, i (i)}
                                <li>
                                    <a class="web-link" {href} {target} {rel}>{label}</a>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </li>
            {/each}
        </ul>
    </div>
</nav>
