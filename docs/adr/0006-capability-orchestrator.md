# ADR 0006: Capability Orchestrator — Indobase-native capabilities, hidden providers

**Status:** Accepted  
**Date:** 2026-08-07  

Canonical: [../INDOBASE-OS.md](../INDOBASE-OS.md) · [../CAPABILITIES.md](../CAPABILITIES.md) · [0005-two-lane-launch.md](./0005-two-lane-launch.md)

---

## Context

Lane 2 needs auth, database, storage, payments, etc. The current tenant BaaS / data-plane path is unreliable as a default engine. The wrong fix is to expose “connect Neon / Coolify / Stripe / Postgres” in the OS or agent.

**Principle (binding):**

| Allowed | Forbidden in customer / agent experience |
|---------|------------------------------------------|
| **External implementation** (any provider under an adapter) | **External product experience** (“Connect X”, provider dashboards, Docker/K8s wizards) |

Customers gain **business capabilities**. They never assemble a toolchain.

---

## Decision

### 1. Capability Orchestrator is the only entry point

```text
Indobase OS (Chat / Planner / Skills)
            │
            ▼
  Capability Orchestrator
    ensure(auth) | ensure(database) | ensure(storage) | ensure(payments) | …
            │
            ▼
  Internal Capability API
            │
    ┌───────┼───────┐
    ▼       ▼       ▼
 Auth    DB/Storage  Deploy/Payments/…
 Adapter  Adapter     Adapters
    ▼       ▼       ▼
 (any provider — swappable, never named in chrome)
```

- OS, agent, and Builder **only** call the Orchestrator (or its Indobase SDK surface).
- They **never** call provider SDKs, provisioner URLs, or “connect” flows directly.

### 2. Indobase-native capability surface (customer + agent language)

| Customer / chat language | ABI / ensure id (internal) | Not |
|--------------------------|----------------------------|-----|
| **Customer Login** | `auth` | Connect Auth / GoTrue / Clerk |
| **Business Data** | `businessData` / `database` | Connect Neon / Postgres / Supabase |
| **File Storage** | `storage` | Connect S3 / MinIO |
| **Payments** | `commerce` | Connect Stripe / Razorpay UI |
| **Email** | `email` | Connect ESP product |
| **Analytics** | `events` | Connect analytics host |
| **Launch** | Launch service / `deploy.launch` | Deploy wizard / Coolify UI |
| **AI Agents** | Agent / Operator runtime | Third-party agent consoles |

SDK shape (illustrative — names may live on `@indobase/platform` / Platform API):

```ts
await indobase.auth.enable()
await indobase.database.create()
await indobase.storage.enable()
await indobase.payments.enable()
await indobase.email.enable()
await indobase.analytics.enable()
await indobase.launch.goLive({ … })
```

Internally each method → Orchestrator → adapter. Providers may change without changing agent tools or customer copy.

### 3. Status UI is Indobase-shaped

Show:

```text
Business Data
✓ Enabled
Location: Asia
Status: Healthy
Backups: Enabled
```

Never show provider, region SKU, or “Plan: Free (Neon)” as the primary surface.

### 4. Compliance / advanced: Indobase first, provider on demand

Hiding providers ≠ denying reality. When asked (“Where is my data?”, export, regions, uptime, migrate-away):

1. Answer in **Indobase terms** (region label, retention, export API, SLA).
2. Expose provider identifiers only in **advanced / compliance / support** contexts — not in Enable / Go Live chat.

### 5. Control plane split (not “delete Studio” as the goal)

Objective: **split the control plane into OS services** (Identity, Workspace, Launch, Capability Engine, Agent Runtime, Operator Runtime). Studio/`saas.*`/current provisioner may remain **one adapter** until replaced. Retire them responsibility-by-responsibility after a proven replacement. See [INDOBASE-OS.md](../INDOBASE-OS.md).

---

## Consequences

- Agent hints and OS chrome: **Enable Customer Login / Business Data / Payments** — never “connect” a named vendor.
- Broken or replaced BaaS → new `DatabaseAdapter` / `AuthAdapter`; Orchestrator API unchanged.
- Two-lane Launch ([0005](./0005-two-lane-launch.md)): Lane 1 needs no Capability Orchestrator; Lane 2 always goes through it.
- Marketing and docs: one Business OS, not a suite of connected tools.

## Non-goals

- Pretending data has no physical location or no export path.
- Rewriting all adapters in one PR.
- Exposing Coolify/Neon/Stripe as customer-facing products under Indobase branding theater.
