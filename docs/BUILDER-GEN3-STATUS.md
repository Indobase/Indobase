# Builder Gen 3 — status

**Updated:** 2026-08-08 (gaps closed before roll)  
**ADR:** [BUILDER-GEN3.md](./BUILDER-GEN3.md) · [INDOBASE-OS.md](./INDOBASE-OS.md) · [adr/0002-os-first-control-plane.md](./adr/0002-os-first-control-plane.md)  
**Product:** CFOS-native **Indobase OS** — one shell; engines behind Capabilities.

---

## Day-one entry (current)

1. Open **`/`** on the CFOS bridge — mints a guest session and serves the agent workspace as the **top document** (direct CFOS; no outer iframe chrome).
2. Guest is account-first: agent must finish OTP in chat (`/auth/start` → `/auth/verify`, DPDP consent) before docs/design/code/launch/enable.
3. Launch / Enable / prompt-quota mutate paths require a signed-in session (`account_required`); `/api/os/launch/status` remains readable for guests.
4. **Gaps closed in repo before any Vyom / `.249` roll** — finish staging smoke first; do not treat Hub SHA tags alone as “safe to roll.”

---

## Indobase OS — Phase 1

| Criterion | Status |
|-----------|--------|
| OS-first constitution + ADR 0002 | **Done** — [INDOBASE-OS.md](./INDOBASE-OS.md) |
| Platform API `/api/os/v1/*` | **Done** — identity, workspace, runtime/ensure, deploy/publish, usage/prompt-quota |
| OS-native signup (no provision) | **Done** — `createOsWorkspace`, bridge → Platform API |
| Guest may browse; Launch/Enable require account | **Done** — bridge `requireSignedInSession` (403 `account_required`) |
| Guest account-first hints | **Done** — `GUEST_ACCOUNT_FIRST_HINT`, session `onboarding.gate`, AGENT_HINT, seed-format-routing |
| Subdomain ownership (no silent takeover) | **Done** — `static-launch` assignDomain conflict |
| Lane 2 plan gate (`backendStudio`) | **Done** — `assertOsEnsureAccess` rejects guest/`draft_*` + Free |
| OS agent prompt quota hook | **Done** — Studio `/api/os/v1/usage/prompt-quota` + bridge `/api/os/usage/prompt-quota` (shares Builder free meter; full CFOS chat metering still open) |
| CFOS CI image (Hub SHA) | **Done** — `docker-publish.yml` builds `roshanraghavander/indobase-builder-cfos:<sha>` |
| PLATFORM_API_URL on CFOS deploy | **Done** — Swarm Studio DNS |
| Achievement home UX | **N/A** — OS is direct CFOS document (no iframe chrome) |
| Lazy Ensurer | **Done** — `os-ensurer.ts` + Capability Orchestrator ([adr/0006](./adr/0006-capability-orchestrator.md)) |
| Launch Business / Go Live | **Done** — customer `business.launch` → Static Launch default ([adr/0005](./adr/0005-two-lane-launch.md)) |
| Enable ≠ Connect | **Accepted** — Indobase-native capabilities; providers hidden |
| Six kernels narrative | **Done** — [INDOBASE-OS.md](./INDOBASE-OS.md) |
| Studio OTP + provision at signup | **Reverted** — not OS-first |
| Legacy SSO handoff | **Kept** — existing accounts only |
| Per-session CFOS agent isolation | **Open** — shared runtime operator until Phase 2 (remaining before multi-tenant agent safety) |
| Full Lane 2 Payments/Email adapters | **Open** |
| Human OTP email send on prod | **Ops verify at roll** — control-plane GoTrue mail |

---

## Agentic Business OS — Phase 0 (chrome)

| Criterion | Status |
|-----------|--------|
| Task sidebar (Website, Brand, Customers, Commerce, Launch Business…) | **Done** |
| Landing Start building | **Done** |
| Indobase OS copy (not Studio front door) | **Done** |

---

## Phase 1 — Gen 3 adapter — DONE

See prior sections in git history for adapter package, bridge wiring, formats Design M1.

---

## Phase 2–4 roadmap

| Phase | Focus |
|-------|--------|
| **2 Business Runtime** | auth, database, storage, functions, commerce, email, analytics, domains via Ensurer |
| **3 Launch Runtime** | full Go Live (`business.launch` → `execution.publish`), mobile/desktop, custom domains, scale/rollback/monitor |
| **4 AI Workforce** | Sales, Marketing, Finance, Support agents |

---

## Non-goals (still)

- Deleting Studio codebase or classic Builder archive  
- Vendoring entire upstream CF OS into git  
- Customer-facing product app front doors  
