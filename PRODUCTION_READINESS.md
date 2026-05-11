# Production readiness checklist

Use this checklist before running Indobase as a production **BaaS / SaaS** stack (dashboard + API + Postgres).

## User flow & onboarding

- [x] Marketing site → "Start building" → sign-up → email confirmation → sign-in → plan selection → create org → product access
- [x] Plan selection page (`/dashboard/billing/plans`) with Free / Pro / Team / Enterprise
- [x] "Go to dashboard" for existing users on plans page; "Start with Free" shortcut
- [ ] **Verify** Email delivery (SMTP / provider) for sign-up and password reset
- [ ] **Verify** Auth redirect URLs and `site_url` in backend auth config match your domain (see [WIRING.md](WIRING.md))
- [ ] **Verify** SaaS mode is explicitly enabled where expected (`NEXT_PUBLIC_INDOBASE_SAAS=true`), and do not rely on legacy `NEXT_PUBLIC_IS_PLATFORM`

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
- [ ] **Verify** public URL envs are aligned (`SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_PUBLIC_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `API_EXTERNAL_URL`)
- [ ] **Verify** TLS/SSL for all public endpoints
- [ ] **Verify** Auth (GoTrue) and API (Kong/PostgREST) rate limits and abuse protection
- [ ] **Verify** Studio public auth endpoints (`/api/platform/signup`, `/api/platform/reset-password`) have abuse controls (IP rate limiting/WAF)
- [ ] **Verify** readiness surface from public origin (`GET https://studio.indobase.in/api/health` should be `200` when healthy)
- [ ] **Verify** Edge Functions JWT enforcement for public APIs (`FUNCTIONS_VERIFY_JWT=true` unless endpoint is intentionally public)
- [ ] **Verify** sensitive Studio platform APIs require auth and are uncached (`Cache-Control: no-store`)
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
- [ ] Run smoke check: `./scripts/studio-production-smoke.sh https://your-studio-domain`

---

After completing the items above, Indobase is in a good state for production use. Revisit this checklist when adding regions, changing payment providers, or after major upgrades.
