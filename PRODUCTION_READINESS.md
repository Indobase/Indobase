# Production readiness checklist

Use this checklist before running Indobase as a production platform (hosted or self-hosted).

## User flow & onboarding

- [x] Marketing site → "Start building" → sign-up → email confirmation → sign-in → plan selection → create org → product access
- [x] Plan selection page (`/dashboard/billing/plans`) with Free / Pro / Team / Enterprise
- [x] "Go to dashboard" for existing users on plans page; "Start with Free" shortcut
- [ ] **Verify** Email delivery (SMTP / provider) for sign-up and password reset
- [ ] **Verify** Auth redirect URLs and `site_url` in backend auth config match your domain (see [WIRING.md](WIRING.md))

## Billing & payments

- [x] Billing plans API and plans page
- [x] New-org wizard with plan selection and payment (Stripe SetupIntent)
- [ ] **Verify** Stripe (or payment provider) is configured: keys, webhooks, products/prices
- [ ] **Verify** Billing webhooks and subscription sync with your backend
- [ ] **Verify** Invoices and usage-based billing if used

## Branding & copy

- [x] CONTRIBUTING.md and PR template point to Indobase
- [x] User-facing Studio strings use "Indobase" (dashboard, support, APIs, Assistant)
- [x] Docs/external links use indobase.fun where appropriate
- [ ] **Optional** Replace remaining "Supabase" in examples, i18n, or internal type names if desired

## Infrastructure & security

- [ ] **Verify** Single domain or multi-domain setup (see [SINGLE_DOMAIN.md](SINGLE_DOMAIN.md))
- [ ] **Verify** `NEXT_PUBLIC_BASE_PATH` is set correctly when Studio is served under a path (e.g. `/dashboard`) so API and assets resolve
- [ ] **Verify** TLS/SSL for all public endpoints
- [ ] **Verify** Auth (GoTrue) and API (Kong/PostgREST) rate limits and abuse protection
- [ ] **Verify** Backups and point-in-time recovery for Postgres
- [ ] **Verify** Secrets and API keys not committed; use env or secret manager

## Monitoring & support

- [ ] **Verify** Error reporting (e.g. Sentry) and logging
- [ ] **Verify** Uptime and health checks for dashboard, API, and auth
- [ ] **Verify** Support channel (email, docs, Discord) and escalation path

## Compliance & legal (if applicable)

- [ ] **Verify** Privacy policy and terms of service
- [ ] **Verify** Data residency and retention policy
- [ ] **Verify** SOC2 / HIPAA / GDPR if required

---

## Before deploy

- [ ] Run `pnpm build` (or `npm run build`) and fix any type or build errors
- [ ] Run `pnpm lint` and fix reported issues
- [ ] Run critical test suites (e.g. `pnpm test:studio`) if available

---

After completing the items above, Indobase is in a good state for production use. Revisit this checklist when adding regions, changing payment providers, or after major upgrades.
