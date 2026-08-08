# Builder Gen 3 — status

**Updated:** 2026-08-08 (begin-turn meter + principal-scoped CFOS login; Lane 2 pending_setup)  
**ADR:** [BUILDER-GEN3.md](./BUILDER-GEN3.md) · [INDOBASE-OS.md](./INDOBASE-OS.md) · [adr/0002-os-first-control-plane.md](./adr/0002-os-first-control-plane.md)  
**Product:** CFOS-native **Indobase OS** — one shell; engines behind Capabilities.

---

## Day-one entry (current)

1. Open **`/`** on the CFOS bridge — mints a guest session and serves the agent workspace as the **top document** (direct CFOS; no outer iframe chrome).
2. Guest is account-first: agent must finish OTP in chat (`/auth/start` → `/auth/verify`, DPDP consent) before docs/design/code/launch/enable.
3. Launch / Enable / prompt-quota mutate paths require a signed-in session (`account_required`); `/api/os/launch/status`, `/api/os/runtime/agent-credentials`, and `/api/os/agent/begin-turn` remain usable for guests (begin-turn does not consume until signed-in).
4. **Gaps closed in repo before any Vyom / `.249` roll** — finish staging smoke first; do not treat Hub SHA tags alone as “safe to roll.”
5. **Prod OTP** — Resend SMTP live on control-plane GoTrue (`auth@indobase.in`); verify with `verify-os-otp-smtp-on-vps.sh --fix`.

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
| OS agent prompt quota hook | **Done** — Studio + bridge endpoints; `/api/session.usage` live snapshot; ChatInterface `POST /api/os/agent/begin-turn` hard meter; AGENT_HINT / seed / adapter rules (402 upgrade copy) |
| Principal-scoped CFOS login | **Done** — `GET /api/os/runtime/agent-credentials` + rebrand `devAutoLogin` (not shared `dev`/`devpassword`) |
| CFOS CI image (Hub SHA) | **Done** — `docker-publish.yml` builds `roshanraghavander/indobase-builder-cfos:<sha>` |
| PLATFORM_API_URL on CFOS deploy | **Done** — Swarm Studio DNS |
| Achievement home UX | **N/A** — OS is direct CFOS document (no iframe chrome) |
| Lazy Ensurer | **Done** — `os-ensurer.ts` + Capability Orchestrator ([adr/0006](./adr/0006-capability-orchestrator.md)) |
| Launch Business / Go Live | **Done** — customer `business.launch` → Static Launch default ([adr/0005](./adr/0005-two-lane-launch.md)) |
| Enable ≠ Connect | **Accepted** — Indobase-native capabilities; providers hidden |
| Six kernels narrative | **Done** — [INDOBASE-OS.md](./INDOBASE-OS.md) |
| Studio OTP + provision at signup | **Reverted** — not OS-first |
| Legacy SSO handoff | **Kept** — existing accounts only |
| Discoverable SaaS actions | **Done** — `/api/session.actions` (Create account, Go Live, Add login, Enable payments) + AGENT_HINT |
| OTP verify clears guest gate | **Done** — verify sets signed-in cookie; response `guest:false` / `onboarding:null`; next `/api/session` matches |

---

## Remaining before roll (defer / ops)

| Item | Notes |
|------|--------|
| **Staging smoke** | Guest OTP → verify → session gate clear; signed-in begin-turn 402; Go Live; Enable login (plan gate) on `*.indobase.fun` before Vyom |
| **Full agent VM / filesystem isolation** | **Open / Phase 2** — principal-scoped CFOS login is done; shared desktop/runtime filesystem isolation is not |
| **Full Lane 2 Payments/Email adapters** | **In progress** — Ensure now returns `pending_setup` + finish-setup copy + `launch_url` / `setup_status` (not “Payments are live” / “Email enabled” from data-plane alone). Product checkout/sender completion still unfinished |
| **Product Auth OTP From branding** | **Done (repo)** — `GET/POST /api/os/v1/auth/mail` + bridge `/api/os/auth/mail`; From applies to live tenant GoTrue on re-apply; ensure(auth) returns `next_steps` |
| **Prod OTP email ops verify** | **Blocked on SMTP** — `verify-os-otp-smtp-on-vps.sh --fix` (2026-08-08): Studio health OK; `/etc/indobase/smtp.env` + `indobase-auth` have **empty** `SMTP_PASS` / no `RESEND_API_KEY` (host `indobase-smtp-relay`). OTP mail will not deliver until real credentials are placed in smtp.env; `--apply` not safe yet |

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
