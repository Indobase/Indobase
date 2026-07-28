<script lang="ts">
    import { Main } from '$lib/layouts';
    import Head from '$lib/components/meta/head.svelte';
    import { MainFooter } from '$lib/components';
    import { Button } from '$lib/components/ui';
    import { getSignUpUrl } from '$lib/utils/dashboard';

    const signUpUrl = getSignUpUrl();
</script>

<Head
    title="Indobase Docs"
    description="Get started with Indobase — database, auth, storage, edge functions, and the Marketing hub."
/>

<Main>
    <div class="web-big-padding-section">
        <div class="container py-16 md:py-24">
            <div class="mx-auto flex max-w-3xl flex-col gap-8">
                <div class="flex flex-col gap-4">
                    <h1 class="text-display font-aeonik-pro text-primary">Documentation</h1>
                    <p class="text-description">
                        Indobase is a full-stack platform for Indian builders — Postgres, auth,
                        APIs, storage, edge functions, AI Builder, and Marketing tools in one
                        workspace.
                    </p>
                </div>

                <section class="flex flex-col gap-4">
                    <h2 class="text-heading font-aeonik-pro text-primary">Get started</h2>
                    <ul class="text-description flex list-disc flex-col gap-2 pl-5">
                        <li>Create a free account and open Studio to create your first project.</li>
                        <li>
                            Use the Marketing hub for Email, Social, Design, Video, and Analytics
                            — all sign in through Studio.
                        </li>
                        <li>
                            Upgrade to Pro when you need the database console, auth users, and
                            backend APIs.
                        </li>
                    </ul>
                    <div class="flex flex-wrap gap-3 pt-2">
                        <Button href={signUpUrl}>Sign up for Studio</Button>
                        <Button href="/pricing" variant="secondary">View pricing</Button>
                        <Button href="/contact-us" variant="secondary">Contact us</Button>
                    </div>
                </section>

                <section class="flex flex-col gap-3 border-t border-smooth pt-8">
                    <h2 class="text-heading font-aeonik-pro text-primary">Platform guides</h2>
                    <p class="text-description text-sm opacity-80">
                        Detailed reference pages are being refreshed on this site. For now, open
                        Studio after sign-up — product docs and API references live in the console
                        for your project.
                    </p>
                </section>
            </div>
        </div>
    </div>

    <div class="container">
        <MainFooter />
    </div>
</Main>
