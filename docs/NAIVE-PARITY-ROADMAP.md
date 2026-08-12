# Naïve Parity Roadmap — Indobase Builder / CFOS

Engineering roadmap to close the UX gap between **Naïve-style one-turn magic** and **Indobase zero-to-one launch** (shipped baseline: `d248343e0`).

Companion architecture doc: [`ZERO-TO-ONE-LAUNCH-ARCHITECTURE.md`](./ZERO-TO-ONE-LAUNCH-ARCHITECTURE.md).

---

## Executive summary

| Dimension | Naïve (target UX) | Indobase today | Gap severity |
| --- | --- | --- | --- |
| **Turns to live store** | 1–2 (prompt → build → publish) | 5–7 (guest → niche → preview → backend chip → wire → Go Live) | **P0** |
| **Backend provisioning** | Implicit / bundled | Explicit `guidedBackend` + chip ladder | **P0** |
| **Follow-up chips** | Always advance to launch | Preview-first niche blocks auto-chain | **P0** (P0 #1 in progress) |
| **Session / tool auth** | Stable project context | Agent principal + cookie drift; `INDOBASE_BRIDGE_URL` misconfig | **P0** (P0 #2 sketch) |
| **Admin / ops** | Generated in-flow | `shop-admin-html.ts` compiler (shipped) | P1 polish |
| **Payments** | Often demo/simulated | BYOK Razorpay/Stripe (intentional) | P2 (BYOK stays) |
| **Data plane** | Postgres/Supabase mental model | PocketBase `ib_{appId}_*` collections (intentional) | Docs only |
| **Preview surface** | In-chat iframe | WebContainer + `*.sites.indobase.in` static lane | P1 |
| **Journey UI** | Implicit progress | `LaunchJourneyCard` + `launch-journey.ts` (shipped) | P1 wiring |

---

## Intentional differences (do not “parity” these away)

| Area | Indobase choice | Notes |
| --- | --- | --- |
| Backend | **PocketBase** on `backend.indobase.in`, not Supabase tenant stacks | Collection prefix `ib_{sanitizeAppId}_*`; records API not PostgREST |
| Payments | **BYOK** Razorpay / Stripe | KYC + `connectGateway` + `wireCheckout`; no simulated checkout in prod |
| Hosting | **Vyom static edge** `*.sites.indobase.in` | Lane 1 via `static-launch.ts`; not third-party CDNs |
| Studio | Pro+ for full backend Studio | Builder/CFOS is the free-tier launch surface |
| Quota | 5 Free prompts | `managed-prompt-quota.ts` / `/api/os/agent/begin-turn` |

---

## Priority backlog

### P0 — Ship first (UX + reliability)

#### P0 #1 — Auto-chain policy ✅ (this PR)

**Problem:** Product policy was preview-first; niche chips say “Do NOT call guidedBackend yet”, forcing 7-prompt flows vs Naïve one-turn magic.

**Acceptance criteria**

- [x] Agent seeds (`seed-format-routing.mjs`, `AGENT_HINT.md`) document **AUTO-CHAIN triggers**: launch store, add real backend, take live (+ store context), create admin.
- [x] `followups.ts` injects **full-chain chips** (`guidedBackend` + `place_test_order`) when `looksLikeAutoChainIntent()` — not preview-only niche.
- [x] `parseGuidedBackendIntent()` recognizes launch / take live / create admin / add backend.
- [x] Tests in `followups.test.ts`, `guided-backend-chain.test.ts`.

**Owner files**

| File | Role |
| --- | --- |
| `indobase-builder-cfos/bridge/src/followups.ts` | `looksLikeAutoChainIntent`, `autoChainStoreFollowups`, `autoChainBackendFollowups` |
| `indobase-builder-cfos/bridge/src/guided-backend-chain.ts` | Intent parsing + agent hard rules |
| `indobase-builder-cfos/scripts/seed-format-routing.mjs` | CFOS `instanceInstructions` seed |
| `indobase-builder-cfos/AGENT_HINT.md` | Human/agent brief mirror |

**Dependencies:** None (policy + parser only).

**Done when (smoke)**

1. Signed-in operator: “Launch my apparel store with real backend” → agent calls `guidedBackend mode=ecommerce` in ≤2 turns (no preview-only niche wall).
2. `POST /api/os/tools/followups` with launch-intent prose → resolved chips contain `guidedBackend` / `INDOBASE_GUIDED_BACKEND`, not “Do NOT call guidedBackend yet”.
3. Bridge unit tests green for followups + guided-backend.

---

#### P0 #2 — Agent principal backend rehydration ✅

**Problem:** After `ensure*` / `guidedBackend`, tool path stashes backend on agent principal; browser cookie may lose `session.backend` → next turn tools fail or agent “forgets” REST base.

**Acceptance criteria**

- [x] `rehydrateSessionBackend()` merges principal snapshot when cookie lacks backend.
- [x] `GET /api/session`, `requireSignedInSessionOrAgentTool`, `resolveSessionOrAgentPrincipal`, and `/api/os/runtime/agent-credentials` call rehydration.
- [x] `resolveSessionOrAgentPrincipal` includes `principal.backend` for agent-tool sessions.
- [x] Guided backend + ensure handlers persist snapshot via `syncGuidedBackendResult` / `syncBackendAfterEnsure`.
- [x] Integration test: `backend-session-sync.test.ts` + `agent-principal-store.test.ts` rehydration.

**Owner files**

| File | Role |
| --- | --- |
| `bridge/src/agent-principal-store.ts` | `lookupAgentPrincipalForSession`, `rehydrateSessionBackend` |
| `bridge/src/index.ts` | `/api/session`, agent credentials, session resolution |
| `bridge/src/backend-session-sync.ts` | Post-ensure cookie + principal sync |
| `bridge/src/agent-credentials.ts` | Username derivation for principal lookup |

**Dependencies:** P0 #1 (auto-chain increases ensure frequency).

**Done when (smoke)**

1. Run `guidedBackend` via agent tool → `curl /api/session` (cookie) returns `backend.api_url` + `anon_key`.
2. Reload CFOS gadget → `launchBusiness` succeeds without `backend_required`.
3. `agent-principal-store.test.ts` + `backend-session-sync.test.ts` pass.

---

#### P0 #3 — Bridge URL / tool availability guard ✅ (minimal)

**Problem:** Tool failures from `INDOBASE_BRIDGE_URL` drift (localhost in prod Swarm).

**Acceptance criteria**

- [x] `/sso/health` exposes `bridgePublicUrl`, `bridgeReachable`, `bridgeUrlMisconfigured`, `managedBackendConfigured`.
- [x] `rebrand-cloudflare-os.mjs` rejects loopback bridge URL — seeds `https://builder.indobase.in` on Vyom.
- [x] Bridge startup warns when PLATFORM_API or managed backend misconfigured; loopback bridge URL in prod.
- [x] Preview lane policy: prefer `launchBusiness` static URL over Gadget iframe (AGENT_HINT, seed-format-routing, `/api/session` launch.preview_policy, discoverable `static-preview` action).

**Owner files:** `bridge/src/index.ts`, `scripts/rebrand-cloudflare-os.mjs`, `docker/scripts/provision-cfos-runtime-on-vps.sh`

**Done when:** Fresh CFOS deploy → `guidedBackend` returns 200 on prod builder; `/sso/health` shows `bridgeReachable: true`.

---

### P1 — Naïve parity (product polish)

| ID | Item | Acceptance | Owner files |
| --- | --- | --- | --- |
| P1 #1 | **Single-turn Go Live** for clear landing asks | “Website for my bakery” → preview + `launchBusiness` in one agent turn when html ready | `guided-backend-chain.ts`, `launch-business-tool.ts`, `AGENT_HINT.md` |
| P1 #2 | **Journey-driven chips** ✅ | `LaunchJourneyCard.next_action` injects chip matching `launch-journey.ts` stage | `launch-journey.ts`, `FollowUpRecommendations.tsx`, `followups.ts` |
| P1 #3 | **Static preview lane** ✅ | After HTML exists, agent quotes `launchBusiness` URL not Gadget iframe; `launch.preview_policy` on `/api/session` | `session-payload.ts`, `AGENT_HINT.md`, `business-os-nav.ts` |
| P1 #4 | **Gadget iframe localStorage** ✅ | No SecurityError on preview; prefer static draft lane (`enforce_static_over_gadget`, HARD preview_policy) | `session-payload.ts`, `rebrand-cloudflare-os.mjs`, `AGENT_HINT.md` |
| P1 #5 | **Wire-proof automation** ✅ | After backend, auto-inject `__INDOBASE_ENV__` via `autoWireLaunchArtifacts` in guidedBackend | `wire-proof.ts`, `publish-env-inject.ts`, `guided-backend-chain.ts` |
| P1 #6 | **Vertical catalog sync** | `vertical-catalog.ts` ecommerce chips align with auto-chain policy | `vertical-catalog.ts`, `followups.ts` |
| P1 #7 | **Chat noise reduction** ✅ | Strip sessionStatus / blueprint list dumps from operator markdown | `followups.ts`, `FollowUpRecommendations.tsx` |

**Done when (P1 milestone):** Staging smoke — new user → live subdomain + wired catalog + admin.html in ≤4 prompts (Free quota).

#### P1 smoke tests (journey chips + static preview)

```bash
cd indobase-builder-cfos/bridge && node --import tsx --test \
  src/followups.test.ts src/launch-journey.test.ts src/session-payload.test.ts
```

Manual (signed-in on builder.indobase.in):

1. Start a landing/store ask → after agent delivers HTML **without** FOLLOWUPS block, chip grid shows **journey next_action** (e.g. Go Live) matching LaunchJourneyCard primary button.
2. `curl -sS -b cookies.txt https://builder.indobase.in/api/session | jq '.journey.next_action, .launch.preview_policy'` — next_action label matches chip; preview_policy mentions launchBusiness not Gadget iframe.
3. After Go Live, agent reply quotes `*.sites.indobase.in` url (not Gadget iframe src) when sharing preview.
4. Operator markdown does not show raw `sessionStatus` JSON or “Listed N blueprints” lines when agent pastes tool output inline.

---

### P2 — Polish (Naïve UX parity) ✅ this roll

| ID | Item | Acceptance | Owner files |
| --- | --- | --- | --- |
| P2 #1 | **Parallel product imagery** ✅ | `guidedBackend` ecommerce starts `resolveProductImages` in parallel with schema seed; 8s timeout → placeholders | `guided-backend-chain.ts`, `product-images-tool.ts` |
| P2 #2 | **Persistent journey card** ✅ | `LaunchJourneyCard` sticky singleton on all signed-in turns (`showLaunchJourney={true}`), not J2-only | `LaunchJourneyCard.tsx`, `FollowUpRecommendations.tsx`, `rebrand-cloudflare-os.mjs` |
| P2 #3 | **Governance / BYOK gates** ✅ | Clear operator copy + choices for quota, account, payments BYOK, wire_required (`governance-gates.ts` on `/api/session`) | `governance-gates.ts`, `prompt-quota.ts`, `wire-checkout-tool.ts`, `session-payload.ts` |

### P2 — Scale & enterprise (later)

| ID | Item | Notes |
| --- | --- | --- |
| P2E #1 | Custom domain auto-verify | Domains product integration |
| P2E #2 | Multi-environment (staging tenant) | Per-project PB isolation |
| P2E #3 | Prompt quota upsell UX | In-chat upgrade without leaving CFOS (partial: governance choices → upgradePlan) |
| P2E #4 | Analytics auto-wire | `ensureAnalytics` post-Go Live |

---

## Gap → code path map

| User-visible gap | Primary code paths |
| --- | --- |
| 7-prompt store flow | `followups.ts`, `seed-format-routing.mjs`, `AGENT_HINT.md`, `guided-backend-chain.ts` |
| Niche preview-only chips | `ECOMMERCE_NICHE_FOLLOWUPS`, `vertical-catalog.ts`, `injectNicheChoices` |
| Backend chain steps | `guided-backend-chain.ts` → `architecture.ts`, `shop-catalog-tool.ts`, `shop-admin-html.ts` |
| Go Live / static lane | `launch-business-tool.ts`, `static-launch.ts`, `app-host-publish.ts` |
| Journey stages UI | `launch-journey.ts`, `LaunchJourneyCard.tsx`, `session-payload.ts` |
| Chip UI timing | `FollowUpRecommendations.tsx`, `rebrand-cloudflare-os.mjs` (`allowFallback`) |
| Agent tool auth | `agent-principal-store.ts`, `index.ts` (`/api/os/runtime/agent-credentials`) |
| Backend snapshot sync | `backend-session-sync.ts`, `session-payload.ts` |
| CFOS rebrand / ChatInterface | `scripts/rebrand-cloudflare-os.mjs` |
| Format routing noise | `seed-format-routing.mjs` |

---

## Milestone smoke tests

### M1 — Auto-chain (P0 #1)

```bash
cd indobase-builder-cfos/bridge && node --import tsx --test src/followups.test.ts src/guided-backend-chain.test.ts
```

Manual: builder.indobase.fun → signed in → “Launch my streetwear store with real inventory” → expect `guidedBackend` tool call without niche preview-only chips.

### M2 — Session rehydration (P0 #2)

```bash
cd indobase-builder-cfos/bridge && node --import tsx --test src/agent-principal-store.test.ts
```

Manual: after guidedBackend, hard refresh → Journey shows backend stage done; storefront fetch hits `backend.indobase.in`.

### M3 — Full zero-to-one (P1)

Manual script:

1. Guest OTP → member
2. Auto-chain store → catalog + test order
3. Go Live → `*.sites.indobase.in`
4. Add payments chip → Razorpay test keys → `wireCheckout`
5. `productionChecklist` → `claim_production_ready: true`

---

## Related commits & docs

- Shipped baseline: zero-to-one engine (`launch-journey.ts`, `LaunchJourneyCard`, `shop-admin-html.ts`) — prod `d248343e0`
- Architecture: [`ZERO-TO-ONE-LAUNCH-ARCHITECTURE.md`](./ZERO-TO-ONE-LAUNCH-ARCHITECTURE.md)
- ADR Lane 1: [`adr/0005-two-lane-launch.md`](./adr/0005-two-lane-launch.md)
- Agent brief: `indobase-builder-cfos/AGENT_HINT.md`

---

## Recommended next actions (after this PR)

1. **P1 #1** — single-turn Go Live for clear landing asks when html is ready in one agent turn.
2. **P1 #6** — vertical-catalog ecommerce chips align with auto-chain (remaining P1).
3. **P2E** — custom domain auto-verify, multi-env PB, analytics auto-wire.
4. Soft-provision CFOS after branding/rebrand/seed changes so ChatInterface gets persistent journey.
