<script lang="ts">
    type Props = {
        title: string;
        href: string;
        class?: string;
    };

    const { title, href, class: className }: Props = $props();
</script>

<a {href} class={`web-hero-banner-button relative mb-4 flex items-center! ${className ?? ''}`}>
    <span class="text-caption shrink-0 font-medium">New</span>
    <div class="web-hero-banner-button-sep"></div>
    <span class="text-caption web-u-trim-1">{title}</span>
</a>
