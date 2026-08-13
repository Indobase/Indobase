# ADR 0008: BusinessRuntimeState is the only truth per turn

**Status:** Accepted  
**Date:** 2026-08-13

Canonical: [../INDOBASE-OS.md](../INDOBASE-OS.md) · [0007-pocketbase-invisible-engine.md](./0007-pocketbase-invisible-engine.md)

---

## Context

UrbanThread failed because chat, Control Center, preview, and launch each held a different story (CC had an order; the agent said the database was unavailable; chrome said LIVE; preview 404). PocketBase HTTP was also leaking into OS session/OTP code.

Studio stays as a **hidden adapter** until migrated. This ADR does not delete Studio, add agent tools, or provision PocketBase per business.

## Decision

1. **IdentityAdapter** is the OS identity boundary. Email OTP → OS Identity → Business/Workspace → OS session. CFOS must not call PocketBase HTTP from session code. PocketBase is one implementation.

2. **BusinessData** is the agent-facing surface (products, customers, orders, inventory, content, documents, settings). Never “query PocketBase.” `BusinessDataAdapter` reads/writes via today’s commerce/PB code.

3. **Launch is independent of PocketBase.** `business.launch` → `execution.publish()` → artifact → static/SSR → domain → HTTPS → LIVE. A landing/static business must not require a data engine. Capability lane only when the operator asks for login, data, or payments. See [0005](./0005-two-lane-launch.md).

4. **CapabilityAdapter** is the public name for hidden ensure (`CapabilityProviderAdapter`). Auth / Business Data / Storage go through it. Provider names never appear in customer copy.

5. **BusinessRuntimeState is mandatory every agent turn.** One object:

```text
identity, business, workspace, spec, preview, deployment, live,
products, customers, orders, capabilities, jobs, health
```

Injected on `/api/session.runtime` and into `agent_hint`. `composeAuthoritativeStateHint` wraps this block. The agent answers “show latest order” from `BusinessRuntimeState.orders` only. It must not invent “connection unavailable” when the snapshot lists the entity, and must not claim preview/LIVE against it.

6. **PocketBase is replaceable.** Target layout is `packages/adapters/pocketbase` and `packages/adapters/deployment`. This pass lands contracts + a thin CFOS façade. Do not mass-move the PB tree.

7. **Five-tool freeze stays.** No new agent tools. No tenant dashboards, backend-setup screens, or per-business PocketBase provisioners.

## Consequences

- Every turn speaks from the same BusinessRuntimeState as Control Center and preview.
- Static Go Live does not wait on PocketBase.
- Physical `packages/adapters/*` move remains future work.
- **NOT CERTIFIED** until a live FTU run agrees with this object.
