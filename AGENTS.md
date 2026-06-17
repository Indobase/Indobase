## Learned User Preferences

- External code audit must have zero Supabase naming in the shipped bundle; fork and rebrand upstream services on GitHub/npm if needed.
- Use Indobase branding in UI, docs, and packages—not Supabase icons, logos, or "fork/clone of Supabase" language.
- Default git branch is `main`; when asked to push or ship, commit on `main` and push to `origin main` after syncing with remote.
- Do not commit or push unless the user explicitly asks.
- After production-facing Studio or control-plane changes, deploy to production using the Swarm rollout flow unless the user opts out.
- User grants VPS SSH access for infra fixes and expects agents to work autonomously until issues are resolved.
- Product goal is Supabase Cloud parity, including multi-tenant architecture with a dedicated database per new project.
- Audit bundle may exclude `examples/` and bulk docs guides initially while vendor shims remain allowlisted.
- Prefer fleet-wide permanent fixes for tenant data-plane and connection issues over per-project patches.
- Product must meet India DPDP (Digital Personal Data Protection) compliance requirements.

## Learned Workspace Facts

- Indobase is a SaaS control plane (Studio `/api/platform/*`, `saas.*` schema, Razorpay billing) on a Supabase-compatible data plane (Kong, GoTrue, PostgREST, per-tenant stacks).
- Published npm SDKs are `@indobaseinc/*` (`@indobaseinc/js` is the root wrapper; unscoped `indobase-js` is not owned by this org). Studio Docker/CI still imports workspace `indobase-js` until `@indobaseinc/*` is declared in `apps/studio/package.json`; undeclared `@indobaseinc/*` imports break docker-publish.
- Per-tenant data planes are Docker Compose stacks on the VPS, provisioned via `data-plane-provisioner` with `repair-stack` / fleet cron self-healing.
- Control plane and tenant DBs share one Postgres host: keep `POSTGRES_PASSWORD` and `SAAS_DATA_PLANE_AUX_ROLE_PASSWORD` aligned; fleet `repair-stack` must ALTER ROLE `authenticator` only once cluster-wide, not per tenant.
- Builder lives in `indobase-builder/` (Remix); Studio handoff via `/launch` + `BUILDER_HANDOFF_SECRET` with optional `next=` redirect; production at `builder.indobase.in` (Swarm `indobase-builder`, Traefik); CI image `roshanraghavander/indobase-builder:<sha>`; Android builds queue through Studio `mobile-builds/builder`; local dev on ports 5173/5174.
- VPS data-plane ops: Traefik must stay on the compose backend network (`indobase-traefik-attach-compose-network.sh`); cap running tenant stacks with `cap-idle-tenant-stacks.sh`.
- Production Studio deploy: GitHub `Indobase/Indobase` `main` → `.github/workflows/docker-publish.yml` → Docker Hub `roshanraghavander/ind-repo:<git-sha>` → VPS Docker Swarm; verify via `studio.indobase.in/api/health/live` `version`.
- Backend data plane runs in Docker Compose; Studio is deployed as a separate application (Swarm/Dokploy), not in the same compose stack.
- Production hosts include `studio.indobase.in`, `api.indobase.in`, `builder.indobase.in`, and per-project tenant endpoints at `[project-ref].indobase.in`.
- Org billing uses Razorpay (INR); Stripe UI is disabled unless explicitly configured.
- Engineering onboarding docs: `docs/ENGINEERING-PLATFORM-HANDBOOK.md` (architecture, screens, UAT matrix); `docs/TEAM-HANDBOOK.md` (design tokens, contributor norms).
- Phase A audit rebrand is tracked in `docs/AUDIT_REBRAND.md` and gated by `scripts/audit-no-supabase.sh` with shim and docs allowlists.
