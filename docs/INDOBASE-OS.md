# Indobase OS — product constitution

**Status:** Binding (Phase 1)  
**Date:** 2026-08-07  
**Kernel:** [`packages/platform`](../packages/platform) · **Shell:** [`indobase-builder-cfos`](../indobase-builder-cfos)  
**Companion:** [PLATFORM.md](./PLATFORM.md) · [BUILDER-GEN3.md](./BUILDER-GEN3.md) · [CAPABILITIES.md](./CAPABILITIES.md) · [adr/0002-os-first-control-plane.md](./adr/0002-os-first-control-plane.md) · [adr/0004-business-launch.md](./adr/0004-business-launch.md) · [adr/0005-two-lane-launch.md](./adr/0005-two-lane-launch.md) · [adr/0006-capability-orchestrator.md](./adr/0006-capability-orchestrator.md)

---

## One sentence

**Indobase OS is the only application customers open.** It builds, launches, and operates entire businesses through chat, native documents, and agents — not through Studio, Builder, or separate product apps.

---

## Customer journey

```text
Website → Indobase OS → Build → Launch Business / Go Live → Operate
```

Not:

```text
Website → Studio → Builder → Design → Payments → Deploy
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
| **Identity** | Sign in, who owns the business | OTP, GoTrue, org membership |
| **Workspace** | Chat, documents, Design/Docs/Sheets/Slides | CFOS shell, Workspace commands |
| **Capability** | “Add login”, “Start charging”, analytics | Ensurer · `capability.ensure` |
| **Execution** | How build / preview / go-live actually run | Adapters, provisioner, static host |
| **Business Runtime** | The live business after Go Live | Tenant data plane, commerce, CRM engines |
| **Agent** | AI that plans and operates inside the OS | Agent runtime, tools, workers |

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

- Studio dashboard (customer destination)
- Product front doors (`design.*`, `payments.*`, …)
- Coolify / Dokploy / Kubernetes / Docker
- Per-tenant provision at signup
- “Create project” wizards
- Deploy / publish / hosting jargon

Those are **adapters**, not customer products.

---

## Two-lane Launch (binding)

```text
business.launch()
 ├─ Static Launch (DEFAULT — ~95%)  → DeploymentAdapter → live URL in ~30–90s
 └─ Capability Launch (on demand)   → Capability Orchestrator → Provider Adapters
```

See [adr/0005-two-lane-launch.md](./adr/0005-two-lane-launch.md). Static Go Live does **not** require a tenant BaaS stack.

---

## Capabilities: enable, don’t connect (binding)

**External implementation → fine. External product experience → not fine.**

```text
User: "Add user login"        → ✓ Login enabled
User: "Add a customer database" → ✓ Customer database created
User: "Add payments"          → ✓ Payments backend ready — finish checkout setup
User: "Add email"             → ✓ Email backend ready — finish sender setup
User: "Launch my business"    → ✓ Your business is live
```

Never in customer chrome, agent copy, or Enable flows:

- Connect Neon / Coolify / Stripe / Postgres / “Supabase” / Docker / Kubernetes

Architecture: Chat → Planner → **Capability Orchestrator** → Internal Capability API → **hidden** Auth/DB/Deploy/Payments adapters. See [adr/0006-capability-orchestrator.md](./adr/0006-capability-orchestrator.md).

Customer language: **Customer Login**, **Business Data**, **File Storage**, **Payments**, **Launch** — not provider names. Status UI is Indobase-shaped (Enabled / Healthy / region label). Compliance questions answer in Indobase terms first; provider IDs only in advanced/support contexts.

---

## Control plane: OS services (not “delete Studio” as the goal)

**Objective:** split the control plane into small OS services — Identity, Workspace (Businesses), Launch, Capability Engine, Agent Runtime, **Operator Runtime** — behind stable interfaces. Adapters underneath are swappable.

Studio UI is not a customer destination. Legacy Studio/`saas.*`/provisioner may remain **one adapter** until each responsibility has a proven replacement; migrate and retire incrementally. Do not market Studio or classic Builder as the product.

Decision history: [adr/0004](./adr/0004-business-launch.md) · [adr/0005](./adr/0005-two-lane-launch.md) · [adr/0006](./adr/0006-capability-orchestrator.md).

---

## Signup policy (lazy backend)

### Create immediately (lightweight)

- Identity (email OTP)
- OS workspace / **Business** record
- Native documents / files in agent runtime

### Enable only when needed (Capability Orchestrator)

- Customer Login · Business Data · File Storage · Payments · Email · Analytics · …

Example: landing page → **no backend**. User says “Add login” → Orchestrator `ensure(auth)` → Auth Adapter → **Login enabled** (provider never named).

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

---

## Architecture layering

```text
Indobase OS (CFOS bridge)
        ↓
Platform API (/api/os/v1)
        ↓
@indobase/platform (Capabilities · Execution · business.launch · …)
        ↓
Execution adapters (provisioner, static host, commerce, CRM, …)
        ↓
Infrastructure (Postgres, MinIO, Traefik, …)
```

No adapter imports from OS or bridge. Swap Coolify for another engine without changing OS.

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

Studio **UI** is internal admin / support — not a customer destination. Studio **codebase** hosts Platform API routes and `saas.*` control-plane logic until extracted. Existing accounts may still use SSO handoff as a **migration bridge**. See **Studio: absorb as headless control plane** above.
