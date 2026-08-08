# ADR 0005: Two-lane Launch — static default, capabilities on demand

**Status:** Accepted  
**Date:** 2026-08-07  

Canonical: [../INDOBASE-OS.md](../INDOBASE-OS.md) · [0003-execution-pipeline.md](./0003-execution-pipeline.md) · [0004-business-launch.md](./0004-business-launch.md)

---

## Context

`business.launch` was wired through Studio Platform API and the tenant provisioner. That puts Docker/auth/Postgres on the critical path for every “Go Live,” which is too heavy for a 10-minute business launch. Customers only need a public URL for ~95% of first launches.

Goal is **not** “delete Studio.” Goal is **remove heavyweight infrastructure from the default Launch path.**

---

## Decision

```text
business.launch()
 ├─ Lane 1 — Static Launch (DEFAULT)
 │    Generate/build → upload assets → *.indobase.in (or bridge /live/:ref) → SSL → Live
 │    No database, auth, tenant stack, compose, or Studio provisioner
 │
 └─ Lane 2 — Business / Capability Launch (WHEN REQUIRED)
      capability.ensure(auth|database|payments|…) → Backend Adapter → runtime
```

### Services (boundary map)

| Service | Responsibility |
|---------|----------------|
| Identity | OTP, users, orgs, billing (small) |
| **Launch** | Upload, deploy, SSL, domains, rollback — **this ADR’s default path** |
| Capability Engine | DB/auth/payments/… only on demand |
| Agent Runtime | Planner, execution, memory, operate |

### Abstraction

```text
DeploymentAdapter.publish / rollback / status / logs
```

Today: disk static host on the OS bridge (`static-launch.ts`).  
Tomorrow: Coolify, CDN, K8s — same interface. Builder/OS never see the engine.

### Customer options (only these)

1. **Indobase subdomain** — `https://{slug}.indobase.in`
2. **Their domain** — domain they already own → CNAME to Indobase (`sites.indobase.in`)

Never offer third-party hosts. OS chrome **Go Live** modal and `POST /api/os/launch` implement both options.

---

## Consequences

- CFOS bridge `POST /api/os/deploy/publish` (and `/api/os/launch`) uses **Static Launch** by default.
- Agent copy: never Vercel/Netlify/GitHub Pages/Studio; always Indobase Go Live.
- `PLATFORM_API_URL` is not required for Go Live.
- Lane 2 stays behind `capability.ensure` / Platform ensurer when intentionally enabled later.

---

## Sequence (10-minute target)

Sign-in → generate → brand → preview → **Launch Business** → static deploy → live URL → AI Operator.
