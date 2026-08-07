# Builder Gen 3 — status

**Updated:** 2026-08-07 (Indobase OS Phase 1)  
**ADR:** [BUILDER-GEN3.md](./BUILDER-GEN3.md) · [INDOBASE-OS.md](./INDOBASE-OS.md) · [adr/0002-os-first-control-plane.md](./adr/0002-os-first-control-plane.md)  
**Product:** CFOS-native **Indobase OS** — one shell; engines behind Capabilities.

---

## Indobase OS — Phase 1 (in progress)

| Criterion | Status |
|-----------|--------|
| OS-first constitution + ADR 0002 | **Done** — [INDOBASE-OS.md](./INDOBASE-OS.md) |
| Platform API `/api/os/v1/*` | **Done** — identity, workspace, runtime/ensure, deploy/publish (wire for `business.launch`) |
| OS-native signup (no provision) | **Done** — `createOsWorkspace`, bridge → Platform API |
| Guest may browse; Launch/Enable require account | **Done** — bridge `requireSignedInSession` (403 `account_required`) |
| Subdomain ownership (no silent takeover) | **Done** — `static-launch` assignDomain conflict |
| Lane 2 plan gate (`backendStudio`) | **Done** — `os-ensurer` (needs Studio image roll) |
| PLATFORM_API_URL on CFOS deploy | **Done** — Swarm Studio DNS |
| Achievement home UX | **Deferred** — OS is direct CFOS document (no iframe chrome) |
| Lazy Ensurer stub | **Done** — `os-ensurer.ts`; evolving toward Capability Orchestrator ([adr/0006](./adr/0006-capability-orchestrator.md)) |
| Launch Business / Go Live stub | **Done** — customer `business.launch` → Static Launch default ([adr/0005](./adr/0005-two-lane-launch.md)) |
| Enable ≠ Connect | **Accepted** — Indobase-native capabilities; providers hidden ([adr/0006](./adr/0006-capability-orchestrator.md)) |
| Six kernels narrative | **Done** — [INDOBASE-OS.md](./INDOBASE-OS.md) (Identity · Workspace · Capability · Execution · Business Runtime · Agent) |
| Studio OTP + provision at signup | **Reverted** — not OS-first |
| Legacy SSO handoff | **Kept** — existing accounts only |
| Per-session CFOS agent isolation | **Open** — shared runtime operator until Phase 2 |

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
