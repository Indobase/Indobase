<script lang="ts">
    import { Main } from '$lib/layouts';
    import Head from '$lib/components/meta/head.svelte';
    import { MainFooter } from '$lib/components';
    import { Button } from '$lib/components/ui';
    import { getSignUpUrl } from '$lib/utils/dashboard';

    const signUpUrl = getSignUpUrl();
</script>

<Head
    title="Indobase Blog"
    description="Product updates, customer stories, and guides from the Indobase team."
/>

<Main>
    <div class="web-big-padding-section">
        <div class="container py-16 md:py-24">
            <div class="mx-auto flex max-w-3xl flex-col gap-8">
                <div class="flex flex-col gap-4">
                    <h1 class="text-display font-aeonik-pro text-primary">Blog</h1>
                    <p class="text-description">
                        Stories about building on Indobase — launches, customer wins, and
                        platform updates for Indian teams.
                    </p>
                </div>

                <section class="flex flex-col gap-4 rounded-lg border border-smooth p-6">
                    <h2 class="text-heading font-aeonik-pro text-primary">Coming soon</h2>
                    <p class="text-description text-sm">
                        We are preparing new posts for this space. In the meantime, start a project
                        in Studio or reach out if you would like to share a customer story.
                    </p>
                    <div class="flex flex-wrap gap-3 pt-2">
                        <Button href={signUpUrl}>Get started</Button>
                        <Button href="/contact-us" variant="secondary">Contact us</Button>
                    </div>
                </section>
            </div>
        </div>
    </div>

    <div class="container">
        <MainFooter />
    </div>
</Main>
