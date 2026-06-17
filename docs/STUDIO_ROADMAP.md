# Studio roadmap (Indobase SaaS)

Living plan for [studio.indobase.in](https://studio.indobase.in). Update this doc when priorities shift or items ship.

## Shipped / in progress (2026 Q2)

| Area | Status | Notes |
|------|--------|-------|
| Razorpay INR billing | Shipped | Org checkout, webhooks, plan tiers in `indobase-billing-plans.ts` |
| Replication UI (stub) | **Disabled** | `unifiedReplication: false` until CDC backend exists |
| Usage metering API | **Partial** | `GET /api/platform/organizations/{slug}/usage` reads `saas.usage_events` when Vector is wired |
| Usage UI gate | Shipped | Empty charts hidden; `UsageMeteringUnavailable` when no events |
| `platform.ts` split | Shipped | `platform-shared`, `platform-schema`, `platform-organizations`, `platform-projects` |
| DnD migration | Shipped | Table editor + enum types use `@dnd-kit` (removed `react-beautiful-dnd`) |
| Marketing on Studio host | Fixed | `/pricing` etc. redirect to `indobase.in` |

## P0 — Production trust (next)

1. **Vector → `saas.usage_events`** — Apply `docker/volumes/db/saas-usage-metering.sql`, configure Postgres sink in `docker/volumes/logs/vector.yml`, verify in Platform Admin → Usage.
2. **Razorpay E2E** — Signup → checkout → webhook → plan upgrade → project create (Playwright).
3. **Distributed rate limits** — Redis-backed limits for signup, password reset, login-adjacent routes (multi-replica Studio).
4. **Sentry + PostHog in prod** — Confirm `SENTRY_DSN` and `POSTHOG_PROJECT_KEY` in CI/Dokploy builds.

## P1 — Billing & metering GA

- Expand usage API beyond EGRESS (MAU, storage, function invocations) aligned with `OrgUsageResponse` metrics.
- Wire **usage-based restrictions** only when `metering_available: true`.
- Remove remaining **Stripe** client paths once Razorpay is sole production path.
- **Usage page** on org billing nav: show link when metering has data (already gated in project settings).

## P2 — Replication & data plane

| Track | Goal | Blocker |
|-------|------|---------|
| **Unified replication** | Real pipelines API replacing `replication-stubs.ts` | Tenant CDC / logical replication design |
| **Branching** | Persist branch tenants beyond flags | `branch-tenant-db.ts` + compose lifecycle |
| **Read replicas** | UI + routing | Not in default generated compose |

See `docker/docs/TENANT_DATA_PLANE_TUNING.md` and `docker/docs/SCALING_CHECKLIST.md`.

## P3 — Plugin marketplace & Builder

| Surface | Path | Decision needed |
|---------|------|-----------------|
| Plugin marketplace | `/org/{slug}/plugins`, `/platform-admin/plugins` | GA vs private beta; review workflow |
| Builder handoff | `builder-launch.ts` | Confirm `BUILDER_HANDOFF_SECRET` + `BUILDER_APP_URL` in prod |
| MCP for Cursor | `mcp-branding.ts`, `/api/mcp` | Agent-native parity with dashboard actions |

## P4 — Code health

- **Tests:** `lib/api/saas/org-usage.ts`, `razorpay-billing.ts`, pg-meta query scoping; coverage gate on `lib/api/saas/**`.
- **ESLint ratchet:** Burn down `no-explicit-any` in SaaS API modules first.
- **Purge `to-be-cleaned/`** imports (~30 files) during the next dependency cleanup pass.
- **Bundle:** Dynamic-import Monaco, GraphiQL, reactflow per route (`ANALYZE=true pnpm -C apps/studio build`).

## P5 — Integrations

- **GitHub** — OAuth app `indobase-studio` (CI bakes client id); verify install flow.
- **Vercel** — Integration URL in Docker build; verify connect sheet.
- **Custom domains** — `custom-domains.ts` + Traefik on tenant stacks.

## Ops references

- Connection strings: `docker/docs/CONNECTION_STRINGS.md` (tenant `*.indobase.in`, pooler ports 5432/6543)
- Deploy: `docker/DOKPLOY-STUDIO-DEPLOY.md`
- Env: `docker/DOKPLOY-STUDIO-ENV.md`
- Platform admin: `docker/PLATFORM-ADMIN-OPS.md`
- Pricing: `docker/docs/INDOBASE_PRICING_MODEL.md`

## Health checks

```bash
curl -sS https://studio.indobase.in/api/health/live | jq .version
curl -sS https://studio.indobase.in/api/health | jq .checks
```
