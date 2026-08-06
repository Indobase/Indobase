# Indobase Platform Constitution

**Status:** Binding  
**Package:** [`packages/platform`](../packages/platform) (`@indobase/platform`)  
**Rule:** Every PR either strengthens a canonical contract or removes product-specific coupling.

Indobase is a **Business Operating System**. Products (Builder, Design, Marketing, CRM, …) and future clients (Nomos) are thin clients of seven contracts — not the other way around.

---

## The seven contracts

| # | Contract | Meaning |
|---|----------|---------|
| 1 | **Identity** | Organization, Project, User, Agent, Role, Permission |
| 2 | **Workspace** | Live working session (Builder, Design, Marketing, CRM, …) |
| 3 | **Document** | First-class artifact each product manipulates (Project, DesignDocument, Campaign, Pipeline, Flow, …) |
| 4 | **Commands** | Every mutation is a command — never mutate directly |
| 5 | **Events** | Everything reacts — nothing polls for truth |
| 6 | **Capabilities** | What a project can do — not product names |
| 7 | **Execution** | How work runs — provision, repair, build, preview, workflow steps — not Docker |

```text
Identity · Workspace · Documents · Commands · Events · Capabilities · Execution
───────────────────────────────────────────────────────────────────────────────
                         packages/platform
───────────────────────────────────────────────────────────────────────────────
  Builder · Design · Studio · Provisioner · Nomos · Agents
```

Product names (Payments, Analytics, CRM) are **adapters**, never kernel imports.  
ABI capability id for checkout/portal is **`commerce`** — product UI may still say Indobase Payments.

---

## Companion specs

| Doc | Contract |
|-----|----------|
| [IDENTITY.md](./IDENTITY.md) | Identity |
| [WORKSPACE.md](./WORKSPACE.md) | Workspace |
| [DOCUMENTS.md](./DOCUMENTS.md) | Document |
| [COMMANDS.md](./COMMANDS.md) | Commands |
| [EVENTS.md](./EVENTS.md) | Events |
| [CAPABILITIES.md](./CAPABILITIES.md) | Capabilities + **Project Runtime ABI** |
| [EXECUTION.md](./EXECUTION.md) | Execution |
| [DATA-PLANE.md](./DATA-PLANE.md) | Tenant runtime substrate (Execution adapter) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Layer diagram + Gen-1 notes |

---

## Forbidden

- Kernel imports Payments / Analytics / CRM / Design Fabric / Builder ActionRunner  
- Products mutate shared state without Commands  
- Agents calling product hosts as source of truth  
- Treating Docker Compose or WebContainer as the Execution *contract*  
- Putting billing status, Studio URLs, internal APIs, or deployment topology on `ProjectRuntime`  

## Allowed

- Adapters behind Execution / Capabilities  
- Builder-local helpers that are not promoted to the ABI (e.g. deploy `INDOBASE_STUDIO_URL` outside `Platform.resolve`)  
- Studio as Identity + Ensurer host  

---

## Status (Gen-1 leakage audit)

Mapped to the twelve architectural points (2026-08-06):

| # | Point | State |
|---|-------|--------|
| 1 | Kernel as single dependency | **Partial** — `@indobase/platform` exists; Builder/Studio/Design still hold legacy orchestration. Continue wrapping, don't rewrite products yet. |
| 2 | Project Runtime ABI (capabilities-only) | **Done (Gen-1)** — `ProjectRuntime` + `FORBIDDEN_RUNTIME_ABI_KEYS`; resolve returns capability-shaped data only. |
| 3 | Capability Resolver as agent gateway | **Done (Gen-1)** — `Platform.resolve` / `resolveProjectRuntime` + `buildGenerationCapabilityContext`; Builder chat injects capability snapshot. |
| 4 | Builder Chat → Commands → Platform | **Phase 2+** — draft preview / workspace types wrapped; ActionRunner path not migrated. |
| 5 | DesignDocument canonical model | **Started** — kernel `DesignDocument` + `designToDocumentRef` stubs; Fabric adapter migration Phase 2. |
| 6 | Commerce terminology in ABI | **Done (Gen-1)** — capability id `commerce`; docs say Commerce not Payments. |
| 7 | Merchant KYC → Identity | **Phase 2+** — do not move yet. |
| 8 | Orders as commerce root | **Phase 2+** — do not implement yet. |
| 9 | Shared Command/Event model everywhere | **Partial** — envelopes + bus in kernel; products still emit locally. |
| 10 | Platform services (not product→product) | **Phase 2+** — resolver is the Gen-1 gateway; full service mesh deferred. |
| 11 | Data Plane formal contract | **Pointer exists** — [DATA-PLANE.md](./DATA-PLANE.md); ops runbooks stay in `docker/`. |
| 12 | Shared Agent Runtime | **Phase 3+** — explicitly deferred (`packages/agent-runtime` must import platform, never reverse). |

### Phase 1 (now) — complete for ABI + Resolver

- ✅ Kernel / Commands / Events / Workspace (Gen-1 envelopes)  
- ✅ Project Runtime ABI capabilities-only  
- ✅ Capability Resolver as generation/agent gateway  

### Builder Gen 3 (Phase 1 landed)

Indobase owns the OS; the agent execution runtime (CF OS) is an adapter only — see **[BUILDER-GEN3.md](./BUILDER-GEN3.md)** and status **[BUILDER-GEN3-STATUS.md](./BUILDER-GEN3-STATUS.md)**.

- Package: [`packages/cloudflare-adapter`](../packages/cloudflare-adapter) (`@indobase/cloudflare-adapter`)  
- Maps execution-runtime concepts → Workspace / Commands / Events / ProjectRuntime / Execution  
- `MutationProposal` → Commands (never direct durable writes from the runtime)  
- PoC bridge: `indobase-builder-cfos` imports the adapter for session → Generation Context  

### Phase 2+ (explicitly deferred)

- Builder full Chat → Commands → Platform migration (ActionRunner ceases to own mutations)  
- DesignDocument Fabric adapter cutover  
- Orders as commerce root; Merchant KYC under Identity  
- Shared Agent Runtime / Planner / Executor / Memory  
- Gen 3 Capability Ensurer, full upstream UI brand strip, publish via Execution  
- Workflow engine, plugin marketplace, distributed bus, CRDT, K8s, Firecracker  

### Not building yet

Kubernetes · microservices sprawl · plugin marketplace · distributed event bus · CRDT everywhere · Firecracker · workflow engine · vector graph DB · full `packages/agent-runtime`.

---

## Agent runtime (later)

`packages/agent-runtime` **imports** `@indobase/platform` (and Gen 3 `@indobase/cloudflare-adapter`). Never the reverse.

Every PR either strengthens a canonical contract or removes product-specific coupling.
