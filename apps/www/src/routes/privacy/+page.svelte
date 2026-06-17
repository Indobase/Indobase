<script lang="ts">
    import { Main } from '$lib/layouts';
    import Head from '$lib/components/meta/head.svelte';
    import { MainFooter } from '$lib/components';

    const grievanceEmail = 'grievance@indobase.in';
    const privacyEmail = 'privacy@indobase.in';
    const legalEntity = 'Indobase Code Pvt. Ltd.';
</script>

<Head title="Privacy Policy - Indobase" />

<Main>
    <section class="web-big-padding-section">
        <div class="web-big-padding-section-level-1 container">
            <div class="web-big-padding-section-level-2 max-w-3xl space-y-8">
                <div>
                    <h1 class="text-display font-aeonik-pro text-primary mb-4">Privacy Policy</h1>
                    <p class="text-description">
                        Effective for users in India under the Digital Personal Data Protection Act,
                        2023 (DPDP Act). {legalEntity} (&quot;Indobase&quot;, &quot;we&quot;,
                        &quot;us&quot;) is the Data Fiduciary for personal data described here.
                    </p>
                </div>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">1. Personal data we process</h2>
                    <ul class="text-main-body list-disc space-y-2 pl-5">
                        <li>
                            <strong>Account data:</strong> name, email, authentication identifiers,
                            organization membership, billing contact details.
                        </li>
                        <li>
                            <strong>Service data:</strong> project metadata, usage telemetry,
                            support tickets, audit logs, and security events.
                        </li>
                        <li>
                            <strong>Payment data:</strong> billing records processed via Razorpay (we
                            do not store full card numbers).
                        </li>
                        <li>
                            <strong>Customer content:</strong> databases, files, and logs in your
                            projects are processed solely to provide the platform. You remain the
                            Data Fiduciary for your end-users&apos; data.
                        </li>
                    </ul>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">2. Lawful purposes</h2>
                    <p class="text-main-body">
                        We process personal data to create and administer accounts, provide the
                        Indobase platform, secure our services, comply with law, bill subscriptions,
                        and—with your consent—for product analytics and marketing communications.
                        We do not sell personal data.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">3. Consent</h2>
                    <p class="text-main-body">
                        Where consent is the lawful basis, we collect it through sign-up checkboxes,
                        cookie/telemetry controls in the dashboard, and explicit opt-ins. You may
                        withdraw consent at any time via Account → Data &amp; privacy or by
                        contacting <a href="mailto:{privacyEmail}" class="web-link">{privacyEmail}</a
                        >. Withdrawal does not affect prior processing.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">
                        4. Rights of Data Principals (DPDP)
                    </h2>
                    <p class="text-main-body">You may exercise the following rights:</p>
                    <ul class="text-main-body list-disc space-y-2 pl-5">
                        <li>Access a copy of personal data we hold about you</li>
                        <li>Request correction of inaccurate or incomplete data</li>
                        <li>Request erasure when retention is no longer necessary</li>
                        <li>Nominate another individual to exercise rights on your behalf</li>
                        <li>Raise a grievance with our Grievance Officer</li>
                    </ul>
                    <p class="text-main-body">
                        Use the Studio dashboard (<strong>Account → Data &amp; privacy</strong>) or
                        email <a href="mailto:{grievanceEmail}" class="web-link">{grievanceEmail}</a
                        >. See our <a href="/dpdp" class="web-link">DPDP notice</a> for timelines.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">5. Retention</h2>
                    <p class="text-main-body">
                        Account metadata is retained while your account is active. After account
                        deletion, control-plane data is removed within 30 days except where longer
                        retention is required for tax, fraud prevention, or legal obligations.
                        Application data in your projects is deleted when you delete the project or
                        organization, subject to your own legal duties to your users.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">6. Security</h2>
                    <p class="text-main-body">
                        We use encryption in transit, access controls, row-level security on
                        multi-tenant metadata, audit logging, and least-privilege operations
                        practices. No method of transmission or storage is 100% secure; report
                        concerns to <a href="mailto:{privacyEmail}" class="web-link">{privacyEmail}</a
                        >.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">7. Cross-border transfers</h2>
                    <p class="text-main-body">
                        Primary hosting for Indian customers is intended to remain in India where
                        configured. If personal data is transferred outside India, we do so only
                        where permitted under applicable law and with appropriate safeguards
                        (contractual clauses, vendor due diligence).
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">8. Children</h2>
                    <p class="text-main-body">
                        Indobase is not directed at children under 18. We do not knowingly collect
                        personal data from children without verifiable parental consent as required
                        by law.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">9. Data breaches</h2>
                    <p class="text-main-body">
                        We maintain incident response procedures. Where required, we will notify the
                        Data Protection Board of India and affected Data Principals in accordance
                        with the DPDP Act.
                    </p>
                </section>

                <section class="space-y-3" id="cookies">
                    <h2 class="text-title font-aeonik-pro text-primary">Cookies &amp; telemetry</h2>
                    <p class="text-main-body">
                        We use essential cookies for authentication and session security. Optional
                        analytics cookies are used only with your consent. Manage preferences in
                        Studio under Account → Data &amp; privacy.
                    </p>
                </section>

                <section class="space-y-3">
                    <h2 class="text-title font-aeonik-pro text-primary">10. Contact</h2>
                    <p class="text-main-body">
                        Privacy: <a href="mailto:{privacyEmail}" class="web-link">{privacyEmail}</a><br
                        />
                        Grievance Officer: <a href="mailto:{grievanceEmail}" class="web-link"
                            >{grievanceEmail}</a
                        ><br />
                        {legalEntity}
                    </p>
                </section>
            </div>
        </div>
    </section>
</Main>

<div class="container">
    <MainFooter />
</div>
