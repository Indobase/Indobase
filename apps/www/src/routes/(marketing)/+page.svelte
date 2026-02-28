<script lang="ts">
    import Bento from './(components)/bento/bento.svelte';
    import Features from './(components)/features.svelte';
    import Hero from './(components)/hero.svelte';
    import Platforms from './(components)/platforms.svelte';
    import Pricing from './(components)/pricing.svelte';
    import { Main } from '$lib/layouts';
    import Head from '$lib/components/meta/head.svelte';
    import Pullquote from '$lib/components/marketing/pullquote.svelte';
    import { MainFooter } from '$lib/components';
    import { onMount, onDestroy } from 'svelte';

    const testimonials = [
        {
            name: 'Sivakumar Gingee',
            title: 'Founder & CEO, Indobase',
            avatar: '/images/testimonials/phil.jpg',
            quote:
                'Indobase is the control plane Indian startups have been waiting for – a single platform that removes infra complexity so founders can ship faster and focus on customers instead of servers.'
        },
        {
            name: 'Roshan Raghavander',
            title: 'Co-founder & CTO, Indobase',
            avatar: '/images/testimonials/phil.jpg',
            quote:
                'We designed Indobase for the realities of building in India – unpredictable scale, tight budgets, and lean teams. It gives startups cloud-level reliability with predictable pricing and a developer experience that feels native to how Indian teams actually work.'
        }
    ] as const;

    let activeIndex = 0;
    let interval: ReturnType<typeof setInterval> | undefined;

    onMount(() => {
        interval = setInterval(() => {
            activeIndex = (activeIndex + 1) % testimonials.length;
        }, 8000);
    });

    onDestroy(() => {
        if (interval) {
            clearInterval(interval);
        }
    });
</script>

<Head title="Indobase - All-in-one infra for solo devs & SMBs" />

<Main>
    <Hero title="All-in-one infra for solo devs & SMBs" />
    <Platforms headline="Designed for the tools you work with" />
    <Bento />
    <Pullquote
        name={testimonials[activeIndex].name}
        title={testimonials[activeIndex].title}
        avatar={testimonials[activeIndex].avatar}
    >
        {testimonials[activeIndex].quote}
    </Pullquote>
    <Features theme="dark" />
    <Pricing />
</Main>

<div class="container">
    <MainFooter />
</div>
