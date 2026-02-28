<script lang="ts">
    import { Main } from '$lib/layouts';
    import Head from '$lib/components/meta/head.svelte';
    import { MainFooter } from '$lib/components';
</script>

<Head title="Privacy Policy - Indobase" />

<Main>
    <section class="web-big-padding-section">
        <div class="container web-big-padding-section-level-1">
            <div class="web-big-padding-section-level-2 max-w-3xl">
                <h1 class="text-display font-aeonik-pro text-primary mb-6">Privacy Policy</h1>
                <p class="text-description mb-4">
                    Indobase is built for Indian startups, and we treat privacy and data protection as
                    first-class concerns. This page is a simplified overview of how we handle personal
                    data in our products and services.
                </p>
                <p class="text-main-body mb-4">
                    By using Indobase, you consent to the collection and use of information in
                    accordance with this Policy. For production use, please review the full legal
                    version of our Privacy Policy shared with customers during onboarding or reach out
                    to our team at <a href="mailto:privacy@indobase.com" class="web-link"
                        >privacy@indobase.com</a
                    >
                    for a copy tailored to your engagement.
                </p>
                <p class="text-main-body">
                    We collect only the data needed to operate, secure, and improve Indobase — such as
                    account details, usage telemetry, and billing information — and we never sell your
                    data. Customer data stored in your projects (for example database records, files,
                    and logs) remains under your control; Indobase processes it solely to provide the
                    platform features you use.
                </p>
            </div>
        </div>
    </section>
</Main>

<div class="container">
    <MainFooter />
</div>

