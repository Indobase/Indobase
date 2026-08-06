# ADR: Builder Gen 3 — Indobase owns the OS; CF OS is execution only

**Status:** Accepted (Phase 1)  
**Date:** 2026-08-06  
**Package:** [`packages/cloudflare-adapter`](../packages/cloudflare-adapter) (`@indobase/cloudflare-adapter`)  
**Companion:** [BUILDER-GEN3-STATUS.md](./BUILDER-GEN3-STATUS.md) · [PLATFORM.md](./PLATFORM.md) · [BUILDER-CFOS-POC.md](./BUILDER-CFOS-POC.md)

---

## Decision

Builder Gen 3 evolves the Cloudflare OS (CF OS) PoC into an **agent execution adapter** behind Indobase’s seven platform contracts. Indobase remains the system of record for identity, projects, workspace, runtime, deployment, capabilities, billing, commands, events, snapshots, and AI orchestration. CF OS never owns project state and must never appear in customer-facing product language.

This ADR does **not** replace production classic Builder in Phase 1. Gen 3 lands beside Gen-1 workspace contracts and migrates ownership incrementally.

---

## Hierarchy (ownership)

```text
┌─────────────────────────────────────────────────────────────────┐
│ Indobase (system of record)                                     │
│  Identity · Projects · Workspace · Commands · Events            │
│  Capabilities / ProjectRuntime · Execution · Snapshots          │
│  Billing · Deploy / Publish · AI orchestration                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Commands + Events + resolve()
┌────────────────────────────▼────────────────────────────────────┐
│ @indobase/cloudflare-adapter                                    │
│  Concept map · MutationProposal → Commands · brand strip        │
│  startAgentTurn / applyProposalsViaCommands                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ execution substrate only
┌────────────────────────────▼────────────────────────────────────┐
│ Agent execution runtime (CF OS implementation detail)           │
│  Agents / tools / ephemeral sandbox UI — no durable SoT writes  │
└─────────────────────────────────────────────────────────────────┘
```

**Rule:** arrows of ownership point inward to Indobase. The adapter may call into CF OS; CF OS must not write `saas.*`, workspace HEAD, or publish state.

---

## Concept map (CF OS → Indobase)

| CF OS / upstream term (internal) | Indobase term | Contract |
|----------------------------------|---------------|----------|
| Workspace | Workspace | Workspace |
| Gadget | App | Workspace / Documents |
| Agent | Agent | Identity |
| Session | Workspace session + Generation Context | Workspace + Capabilities |
| Tool / action | Capability intent → Command | Capabilities + Commands |
| File / tree mutation | `MutationProposal` → `workspace.modify` / `workspace.generate` | Workspace + Commands |
| Preview sandbox | `execution.preview` | Execution |
| Deploy / publish | `execution.publish` (Indobase hosting) | Execution |
| Auth / project keys | Studio SSO + ProjectRuntime `dataPlane` | Identity + Project Runtime ABI |

Customer UI, agent hints, and chrome copy use **only** the Indobase column. Internal code comments and env vars may say “CF OS”.

---

## Adapter boundary

`@indobase/cloudflare-adapter` is the only supported translation layer between the agent execution runtime and `@indobase/platform`.

Required surfaces (Phase 1):

1. **Concept mapping** — typed aliases + helpers (`mapCfConcept`, `INDOBASE_CF_CONCEPT_MAP`).
2. **`MutationProposal` → Commands** — `applyProposalsViaCommands` / `proposalsToWorkspaceCommands` produce platform `Command` envelopes. Executors never call filesystem/DB writers for durable project trees.
3. **`startAgentTurn`** — turns are Indobase-scoped (`projectRef`, `baseSnapshotId`, generation context). The adapter returns proposals + events; Workspace commits snapshots.
4. **Brand stripping** — `stripVendorBranding` / `assertNoVendorBranding` for customer-facing strings.
5. **Session → Generation Context** — bridge SSO session / backend payload → `GenerationCapabilityContext` (and related prompt helpers), never product-host SoT.

Bridge PoC (`indobase-builder-cfos`) **imports the adapter**. It must not grow a parallel type system.

---

## Anti-wrapper rules (non-negotiable)

1. **No ownership inversion** — CF OS is not “the product”; Indobase is.
2. **No direct durable writes** from the agent runtime into project state. Path: proposals → Commands → Workspace commit → Events.
3. **No Cloudflare product naming** in UI, agent hints shown to operators as product copy, README customer sections, or Studio chrome.
4. **No billing / plan / Studio URL leakage** onto `ProjectRuntime` (reuse Gen-1 ABI quarantine).
5. **No “thin forever” wrapper** — Phase 1 establishes the adapter package; later phases move Chat→Commands, Ensurer, and publish through the same boundary instead of bolting features onto the bridge alone.
6. **Do not vendor** the full upstream CF OS tree into git in Phase 1 (fetch script / gitignore remains).

---

## Migration phases

| Phase | Goal | Exit |
|-------|------|------|
| **1 (this ADR)** | Adapter package + docs + PoC wired through adapter; deprecation markers on legacy owners | Tests green; status doc lists backlog |
| **2** | Chat → Commands → Platform; Capability Ensurer in Studio; deeper brand strip in proxied UI | ActionRunner no longer SoT for mutations |
| **3** | Shared agent runtime package; publish path via Execution; optional Swarm Gen-3 runtime | Classic Builder paths retired behind flags |

Classic Builder (`indobase-builder`) stays production until Phase 2/3 cutover. See deprecation notes on ActionRunner and draft-preview ownership.

---

## Related Gen-1 contracts

- [PLATFORM.md](./PLATFORM.md) — seven contracts  
- [WORKSPACE.md](./WORKSPACE.md) — `MutationProposal`, snapshots  
- [COMMANDS.md](./COMMANDS.md) · [EVENTS.md](./EVENTS.md) · [EXECUTION.md](./EXECUTION.md)  
- [CAPABILITIES.md](./CAPABILITIES.md) — Project Runtime ABI + generation context  
- PoC ops: [BUILDER-CFOS-POC.md](./BUILDER-CFOS-POC.md)

---

## Consequences

- New agent/runtime work goes through `@indobase/cloudflare-adapter` + `@indobase/platform`.
- Studio launch (`builder-cfos-launch`) remains Indobase SSO; runtime switch is an Execution substrate choice, not a product fork.
- Phase 2+ backlog is tracked in [BUILDER-GEN3-STATUS.md](./BUILDER-GEN3-STATUS.md).
