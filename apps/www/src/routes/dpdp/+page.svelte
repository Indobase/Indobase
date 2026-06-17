<script lang="ts">
    import { Main } from '$lib/layouts';
    import Head from '$lib/components/meta/head.svelte';
    import { MainFooter } from '$lib/components';

    const grievanceOfficer = 'Data Protection Officer';
    const grievanceEmail = 'grievance@indobase.in';
    const legalEntity = 'Indobase Code Pvt. Ltd.';
</script>

<Head title="DPDP Notice - Indobase" />

<Main>
    <section class="web-big-padding-section">
        <div class="web-big-padding-section-level-1 container">
            <div class="web-big-padding-section-level-2 max-w-3xl space-y-8">
                <div>
                    <h1 class="text-display font-aeonik-pro text-primary mb-4">
                        DPDP compliance notice
                    </h1>
                    <p class="text-description">
                        This notice supplements our <a href="/privacy" class="web-link"
                            >Privacy Policy</a
                        > and describes how {legalEntity} complies with India&apos;s Digital Personal
                        Data Protection Act, 2023.
                    </p>
                </div>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">Data Fiduciary</h2>
                    <p class="text-main-body">
                        {legalEntity}, operating as Indobase, determines the purpose and means of
                        processing personal data for platform accounts, billing, and security.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">Grievance Officer</h2>
                    <p class="text-main-body">
                        <strong>{grievanceOfficer}</strong><br />
                        Email: <a href="mailto:{grievanceEmail}" class="web-link">{grievanceEmail}</a
                        ><br />
                        We acknowledge grievances within <strong>7 working days</strong> and aim to
                        resolve them within <strong>30 days</strong>, extendable where complexity
                        requires.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">How to exercise your rights</h2>
                    <ol class="text-main-body list-decimal space-y-2 pl-5">
                        <li>
                            Sign in to Studio → <strong>Account → Data &amp; privacy</strong> to
                            download your data, manage telemetry consent, request correction, or
                            submit a grievance.
                        </li>
                        <li>
                            Email <a href="mailto:{grievanceEmail}" class="web-link"
                                >{grievanceEmail}</a
                            > with your registered email and a description of your request.
                        </li>
                        <li>
                            For account erasure, use the deletion flow on the same page after
                            leaving all organizations.
                        </li>
                    </ol>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">Consent records</h2>
                    <p class="text-main-body">
                        We maintain timestamped records of privacy/terms consent at sign-up and
                        marketing/telemetry choices in your account settings, as required for
                        accountability under the DPDP Act.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">Your projects &amp; end-users</h2>
                    <p class="text-main-body">
                        When you store personal data in Indobase projects, you act as Data
                        Fiduciary to your users. You are responsible for notices, consent, and
                        rights fulfilment for that data. Indobase acts as a Data Processor to the
                        extent we host and process that data on your instructions.
                    </p>
                </section>
            </div>
        </div>
    </section>
</Main>

<div class="container">
    <MainFooter />
</div>
