# Builder Gen 3 — status

**Updated:** 2026-08-06 (Phase 2 Commands slice)  
**ADR:** [BUILDER-GEN3.md](./BUILDER-GEN3.md) · [adr/0001-builder-gen3-cloudflare-adapter.md](./adr/0001-builder-gen3-cloudflare-adapter.md)

---

## Phase 1 — DONE

| Criterion | Status |
|-----------|--------|
| ADR documenting hierarchy, adapter boundary, migration phases, anti-wrapper rules, CF→Indobase map | Done — `docs/BUILDER-GEN3.md` + `docs/adr/0001-builder-gen3-cloudflare-adapter.md` |
| Package `@indobase/cloudflare-adapter` mapping CF concepts → platform types | Done — `packages/cloudflare-adapter` |
| `MutationProposal` → Indobase workspace Commands | Done — `applyProposalsViaCommands` / `proposalsToWorkspaceCommands` |
| Adapter interfaces: `startAgentTurn`, `applyProposalsViaCommands`, brand strip | Done — `createCloudflareOsAdapter` |
| Unit tests for adapter | Done — `pnpm test` in package |
| CFOS PoC wired through adapter (session → Generation Context / Indobase naming) | Done — `bridge/src/indobase-adapter.ts`, `/api/session`, workspace chrome |
| README / AGENT_HINT Indobase-only customer language | Done |
| Deprecation notes on legacy ActionRunner + draft-preview ownership | Done — code comments + this doc |
| `docs/BUILDER-CFOS-POC.md` + `docs/PLATFORM.md` Gen-3 pointers | Done |
| This status doc with Phase 2+ backlog | Done |

### How to test Phase 1

```bash
# Adapter
cd packages/cloudflare-adapter
pnpm install --ignore-workspace
pnpm test

# Bridge (uses adapter via file: deps)
cd ../../indobase-builder-cfos/bridge
pnpm install --ignore-workspace
pnpm test
```

---

## Phase 2 — Commands ownership (this slice) — DONE

Chat / codegen durable mutations no longer treat ActionRunner as SoT when Gen 3 Commands are enabled.

| Criterion | Status |
|-----------|--------|
| `MutationProposal` → `applyProposalsViaCommands` → Workspace commit path in classic Builder | Done — `indobase-builder/app/lib/workspace/gen3-apply.ts` |
| Flag-gated cutover (`BUILDER_GEN3_COMMANDS=1` / `VITE_BUILDER_GEN3_COMMANDS=1`), classic default | Done — `gen3-flag.ts`; `commitWorkbenchFiles` routes via Gen3 when on |
| `finalizeCodegen` commit path uses Commands when flag on | Done — via `commitWorkbenchFiles` → `commitWorkbenchFilesViaGen3` |
| Emit `WorkspaceCommitted` (+ CommandQueued / CommandStarted) on Gen3 path | Done — WorkspaceEventBus + lifted PlatformEventBus |
| ActionRunner demoted to WC / preview compatibility adapter | Done — header + `@deprecated`; still ephemeral FS/shell only |
| Unit / integration tests for apply path | Done — `gen3-apply.spec.ts` |
| Indobase branding; Cloudflare execution-only | Done — local project sentinel `builder-local`; no CF product naming |

### How to test Phase 2

```bash
# Adapter (still green)
cd packages/cloudflare-adapter && pnpm test

# Gen 3 workspace apply + classic workspace suite
cd ../../indobase-builder
pnpm exec vitest --run --config vitest.workspace.config.ts
```

Enable at runtime (optional smoke):

```bash
BUILDER_GEN3_COMMANDS=1   # server
# and/or
VITE_BUILDER_GEN3_COMMANDS=1  # client bundle
```

---

## Remaining Phase 2+ / Phase 3 backlog

| Item | Notes |
|------|--------|
| **Capability Ensurer in Studio** | Ensure capabilities before generation; feed Resolver → `GenerationCapabilityContext` (not product-host SoT). |
| **Full brand strip in proxied UI** | Rewrite remaining vendor strings/assets inside `/os/app/*` beyond chrome + hints. |
| **Publish via `execution.publish`** | Gen 3 publish → Indobase hosting (subdomain / custom domain / Android queue), not classic-only deploy helpers. |
| **Draft preview ownership** | Move draft/server-build under Execution adapters; retire Builder-local ownership (`draft-preview.server.ts` marked). |
| **Agent transport** | `startAgentTurn` over bridge (Cap’n Web / Gatekeeper); still returns `MutationProposal[]` only. |
| **Shared `packages/agent-runtime`** | **Gen-1 thin done** — imports platform; Planner/Executor productization + Builder chat wire-up still backlog. |
| **Production Swarm Gen 3** | Only after staging smoke; out of this slice. |
| **Default Gen3 Commands on** | Keep flag off in prod until Ensurer + transport + publish paths are ready. |

---

## Non-goals (still)

- Deleting production classic Builder  
- Vendoring entire upstream CF OS into git  
- Force-push / prod deploy without explicit ask  
