# Indobase OS — product constitution

**Status:** Binding (Phase 1)  
**Date:** 2026-08-07  
**Kernel:** [`packages/platform`](../packages/platform) · **Shell:** [`indobase-builder-cfos`](../indobase-builder-cfos)  
**Companion:** [PLATFORM.md](./PLATFORM.md) · [BUILDER-GEN3.md](./BUILDER-GEN3.md) · [CAPABILITIES.md](./CAPABILITIES.md) · [adr/0002-os-first-control-plane.md](./adr/0002-os-first-control-plane.md) · [adr/0004-business-launch.md](./adr/0004-business-launch.md) · [adr/0005-two-lane-launch.md](./adr/0005-two-lane-launch.md) · [adr/0006-capability-orchestrator.md](./adr/0006-capability-orchestrator.md) · [adr/0007-pocketbase-invisible-engine.md](./adr/0007-pocketbase-invisible-engine.md) · [adr/0008-business-runtime-state.md](./adr/0008-business-runtime-state.md)

---

## One sentence

**Indobase OS is the only application customers open.** It builds, launches, and operates entire businesses through chat, native documents, and agents — not through Studio, Builder, or separate product apps.

---

## Customer journey

```text
Website → Indobase OS → Chat → Build → Launch → Operate
```

Not:

```text
Website → Studio → Project → Tenant → Provisioner → Deploy
```

---

## Six kernels (production narrative)

Customer and investor story uses **six kernels**. Platform contracts in [PLATFORM.md](./PLATFORM.md) (Documents, Commands, Events, …) still apply under the hood; this diagram is the production narrative, not a replacement ABI list.

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Indobase OS (customer shell)                │
└─────────────┬───────────┬───────────┬───────────┬───────────────┘
              │           │           │           │
     ┌────────▼───┐ ┌─────▼─────┐ ┌───▼────┐ ┌───▼────────┐
     │ Identity   │ │ Workspace │ │ Capab. │ │ Execution  │
     │ who / auth │ │ session · │ │ what   │ │ how work   │
     │ OTP · SSO  │ │ docs · UI │ │ can do │ │ runs       │
     └────────────┘ └───────────┘ └────────┘ └─────┬──────┘
                                                   │
              ┌────────────────────────────────────┼────────────────┐
              │                                    │                │
     ┌────────▼──────────┐              ┌──────────▼────────┐       │
     │ Business Runtime  │              │ Agent             │       │
     │ live business ops │◄─────────────│ plan · act · loop │───────┘
     │ after Go Live     │  business.launch → execution.publish
     └───────────────────┘
```

| Kernel | Customer meaning | Substrate (never shown as product UI) |
|--------|------------------|----------------------------------------|
| **Identity** | Sign in, who owns the business | `IdentityAdapter` (PocketBase OTP today; Studio-era OTP is a hidden fallback) |
| **Workspace** | Chat, documents, Design/Docs/Sheets/Slides | CFOS shell, Workspace commands |
| **Capability** | “Add login”, “Start charging”, analytics | `CapabilityAdapter` · `capability.ensure` |
| **Execution** | How build / preview / go-live actually run | Launch Engine, static/app host — **not** PocketBase |
| **Business Runtime** | Live business data after Launch | `BusinessDataAdapter` → shared PocketBase (invisible) |
| **Agent** | AI that plans and operates inside the OS | Agent runtime, tools, workers — **BusinessRuntimeState every turn** |

### `business.launch` vs `execution.publish`

| Layer | Verb | Audience |
|-------|------|----------|
| **Customer chrome** | **Launch Business** / **Go Live** (`business.launch`) | Operators, UI, success copy |
| **Platform substrate** | `execution.publish` | Kernel, adapters, Platform API |

Chrome never says “deploy”, “publish”, or “site hosting”. Agents may call substrate APIs; they must speak Launch Business / Go Live to the operator.

Until a dedicated `/api/os/v1/business/launch` route exists, OS bridge and Platform API keep **`POST /api/os/v1/deploy/publish`** as the wire path for `business.launch` → `execution.publish`. Rename later; do not invent a duplicate route while that endpoint owns the pipeline.

---

## What the customer sees

```text
+-------------------------------------------------------+
| Chat / AI Agent                                       |
| Workspace · Documents · Design · Spreadsheets         |
| Websites · Mobile · CRM · Email · Commerce · Analytics|
| Launch Business · Go Live · Monitor · Upgrade         |
+-------------------------------------------------------+
```

Products become **agents** internally (Design Agent, Finance Agent, Sales Agent…). The user never switches applications.

---

## What the customer never sees

- Studio, Project, Tenant, Provisioner
- PocketBase, Coolify, Docker, Traefik, Postgres, Kong
- Product front doors (`design.*`, `payments.*`, …)
- “Create project” wizards
- Deploy / publish / hosting / “backend ready” jargon

Those are **adapters**, not customer products. PocketBase is the business-data engine — never an integration the operator connects.

---

## Two-lane Launch (binding)

```text
business.launch()
 ├─ Static Launch (DEFAULT — ~95%)  → DeploymentAdapter → live URL in ~30–90s
 └─ Capability Launch (on demand)   → Capability Orchestrator → Provider Adapters
```

See [adr/0005-two-lane-launch.md](./adr/0005-two-lane-launch.md) · [adr/0008](./adr/0008-business-runtime-state.md). Static / landing Go Live does **not** require PocketBase provision. Capability lane only when they ask for login, data, or payments.

---

## Capabilities: enable, don’t connect (binding)

**External implementation → fine. External product experience → not fine.**

```text
User: "Add customer login"    → ✓ Customer login is enabled
User: "Add these 20 products" → ✓ Products are in your store
User: "Add payments"          → ✓ Payments are enabled — finish checkout setup
User: "Add email"             → ✓ Email is enabled — finish sender setup
User: "Launch my business"    → ✓ Your business is live
```

Never in customer chrome, agent copy, or Enable flows:

- Studio / PocketBase / tenant / provisioner / Neon / Coolify / Stripe / Postgres / Docker / Kubernetes / “backend ready”

Architecture: Chat → Planner → **Capability Orchestrator** → `CapabilityAdapter` → hidden Auth / Business Data / Storage / Payments impl (PocketBase today). See [adr/0006](./adr/0006-capability-orchestrator.md) · [adr/0008](./adr/0008-business-runtime-state.md).

Customer language: **Customer Login**, **Business Data**, **File Storage**, **Payments**, **Launch** — not provider names. Status UI is Indobase-shaped (Enabled / Healthy / region label). Compliance questions answer in Indobase terms first; provider IDs only in advanced/support contexts.

---

## Control plane: Studio off the product path (migrate, don’t mass-delete)

**Objective:** Indobase OS owns Identity, Workspace (Businesses), Launch, Capability Engine, Agent Runtime, and Operator Runtime. Studio is **not** a customer product and **not** on the new critical runtime path.

Remove Studio from the journey and from new code paths. Keep Studio-era capabilities (`saas.*`, Platform API host, billing, prompt meter, OTP) as **hidden adapters** until each has a proven OS replacement. Do not market Studio or classic Builder.

**Do not** recreate dedicated-per-business infrastructure inside PocketBase (one container + network + deploy per business). Default is shared PocketBase scoped by workspace / business id. Isolate only when scale or security requires it. See [adr/0007](./adr/0007-pocketbase-invisible-engine.md).

Decision history: [adr/0004](./adr/0004-business-launch.md) · [adr/0005](./adr/0005-two-lane-launch.md) · [adr/0006](./adr/0006-capability-orchestrator.md) · [adr/0007](./adr/0007-pocketbase-invisible-engine.md) · [adr/0008](./adr/0008-business-runtime-state.md).

---

## Signup policy (lazy backend)

### Create immediately (lightweight)

- Identity (email OTP)
- OS workspace / **Business** record
- Native documents / files in agent runtime

### Enable only when needed (Capability Orchestrator)

- Customer Login · Business Data · File Storage · Payments · Email · Analytics · …

Example: landing page → **no data engine**. User says “Add login” → Orchestrator `ensure(auth)` → `CapabilityAdapter` → **Login enabled** (provider never named).

---

## Roadmap phases

| Phase | Goal |
|-------|------|
| **1 — Indobase OS** | CFOS shell, chat-first UX, achievement home, native Design/Docs/Sheets/Slides, Platform API skeleton, lazy Ensurer stub, **`business.launch` → `execution.publish` (PR1+PR2)** |
| **2 — Business Runtime** | **Next milestone:** deepen `business.launch` (Plan / Configure / Verify / Operator) + auth, database, storage, functions, payments, email, analytics, domains via Ensurer |
| **3 — Launch Runtime** | Full Launch hardening — mobile/desktop, custom domains, scale/rollback/monitor on top of `execution.publish` |
| **4 — AI Workforce** | Sales, Marketing, Finance, Support, HR, Operations agents |

Classic Remix Builder is **archive only**. “Builder” as a product name disappears from customer copy.

**Public Launch verb:** `business.launch()` — see [adr/0004-business-launch.md](./adr/0004-business-launch.md).

---

## Binding UX rules

1. Home asks **“What do you want to achieve today?”** — not “Projects / Templates”.
2. Go Live is one sentence: **“Launch my business.”** — OS runs `business.launch` → `execution.publish`.
3. Design opens as a **native document** (`format.design`), not `design.indobase.in`.
4. Finish every task **inside Indobase OS** ([PLATFORM.md](./PLATFORM.md) principle).
5. Customer chrome says **Launch Business / Go Live** — never deploy / publish / hosting.
6. Every agent turn receives **one** `BusinessRuntimeState`. Never invent preview, LIVE, or “connection unavailable” against it.

---

## 10-minute journey (product SLA)

Encode in agent hint — do not add tools to make this true:

| Min | Outcome |
|-----|---------|
| 0–1 | Intent |
| 1–3 | Business identity / site / brand / products |
| 3–5 | Storefront / cart / checkout / data model |
| 5–7 | Real preview + click-to-edit |
| 7–8 | Silent `ensure(auth)` only if they need login |
| 8–9 | `launchProductionApp` → `business.launch` → `execution.publish` |
| 9–10 | LIVE + operate from `BusinessRuntimeState` |

---

## BusinessRuntimeState (binding — ADR 0008)

One object per turn on `/api/session.runtime` and `agent_hint`:

```text
identity · business · workspace · spec · preview · deployment · live
products · customers · orders · capabilities · jobs · health
```

Answer “show latest order” from `orders` only. Chat, Control Center, preview, and launch are projections of this object — not competing truths.

**Adapters (contracts now; physical `packages/adapters/*` later):** `IdentityAdapter` · `BusinessDataAdapter` · `CapabilityAdapter` · `DeploymentAdapter`. PocketBase is today’s impl and is replaceable.

---

## Architecture layering

```text
INDOBASE OS (Chat/Agent: Ask → Build → Run → Launch → Operate)
        │
  CFOS Runtime
        │
  PocketBase (hidden) | Launch | Capabilities
        │
  hidden infrastructure  (Studio / saas.* / provisioner until retired)
```

Launch Engine owns `execution.publish` and does **not** require PocketBase for a static/landing business. No adapter imports from OS or bridge. Swap a host engine without changing OS.

---

## Operate (post-launch) — Workforce slice

After Go Live, `business.launch` runs **ConfigureBusiness** → **Verify** → **StartOperator**. Configure and Operator are best-effort (never fail an already-published Launch). Verify may hard-fail Launch when homepage checks fail under strict mode — hosting is not torn down.

| Piece | Location | Behavior today |
|-------|----------|----------------|
| **ConfigureBusiness** | `apps/studio/lib/api/saas/os-business-configure.ts` | Persists `auth_config.os_business_config`: SEO/social stubs from workspace name, robots/sitemap expectation URLs, public URL note, payments/email/analytics `ready\|pending` when those capabilities were ensured. No payment-gateway or DNS rewrites. |
| **Verify** | `apps/studio/lib/api/saas/os-launch-verify.ts` | **Hard:** homepage unreachable when `strictVerify` (default for artifact publish; env `OS_LAUNCH_STRICT_VERIFY`; hosting-only softens). Fails Launch with `VERIFY_FAILED` + stamps `os_publish.verify_failed` (no hosting teardown). **Soft:** robots/sitemap missing or unhealthy, optional health paths, auth login deferred. Returns `{ passed, checks[], failures[], warnings[] }`. Persists `auth_config.os_launch_verify`. |
| **AI Operator** | `apps/studio/lib/api/saas/os-ai-operator.ts` + `os-operator-workforce.ts` | `startOperator` → `phase: 'workforce'`, status `monitoring`. Runs an **in-process** job pass via `@indobase/agent-runtime` (`beginRun` → plan → `executeStep` → `finishRun`): **uptime check**, **SEO basics** (title / meta / robots / sitemap), **error-signal placeholder** (`OperatorErrorSignalProvider` extension point). Persists `auth_config.os_operator` with `last_run_at`, `jobs[]`, `next_suggestions[]`. Emits `OperatorStarted` + `OperatorJobsCompleted` on `Platform.events`. |
| **Ports** | `os-business-configure.ts` + `os-business-operate-ports.ts` → `business.launch` | Wired from `os-business-launch.ts`. Queued Launch resumes via `os-publish-resume` → Operate hook (Verify + Operator). |

### Real vs deferred (Operator)

| Real now | Still deferred |
|----------|----------------|
| Sync uptime probe of `liveUrl` | Continuous / cron background workers |
| SEO title/meta/robots/sitemap findings + suggestions | Marketing campaign engines |
| Structured error-signal no-op + provider hook | Email answering / support inbox agents |
| Session + job results on `auth_config.os_operator` | Inventory / invoice / CRM operate loops |
| Soft-fail (Launch stays live if operator fails) | Payment provider UI; Configure hard-fail gating |

Extension: deepen `agent-runtime` planners/executors and wire `OperatorErrorSignalProvider` to Sentry/analytics; keep `auth_config.os_business_config` / `os_operator` / `os_launch_verify` as the durable session shape until a dedicated table is justified.

---

## Studio’s role

Studio **must not appear** in the customer journey or in new OS architecture. Studio **codebase** may still host Platform API routes and `saas.*` until extracted. Existing accounts may use SSO handoff as a **migration bridge** only — never as “Open Studio to continue.” See [adr/0007](./adr/0007-pocketbase-invisible-engine.md).
