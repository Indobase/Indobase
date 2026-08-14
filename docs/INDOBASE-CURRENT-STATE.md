# Indobase OS — current-state handoff

**Regenerate this file after any major architecture or certification change.**  
**Do not treat chat history as source of truth.**  
**Generated:** 2026-08-14  
**Inspected branch:** `staging` (Phase 2B catalog **live-certified** on CFOS)  
**Last LIVE cert SHA:** `09179082df33d7373fe9987d3bead47a862fc56f` — Builder CFOS on `.249` / `builder.indobase.in`  
**Live CFOS health:** `https://builder.indobase.in/sso/health` `version` = `09179082d`  
**`origin/main`:** `da5a1c6c05bc7ab22af2717f60c83436254f3c95` (CFOS landing slice is on `staging` only; **not** promoted)

This document is an engineering snapshot of **Indobase Builder/OS**, not Studio, not NorthPeak, not TutorDesk.

---

## 1. Executive summary

**What Indobase is:** an agentic business OS. A person describes a business in chat; the OS is supposed to classify it, build a preview, accept edits, launch it live, and operate it from the same workspace.

**What Builder/OS actually does today:** CFOS (Cloudflare OS shell) + Node bridge (`indobase-builder-cfos/bridge`) is the customer surface at `builder.indobase.in`. Chat turns hit `POST /api/os/agent/begin-turn` → `applyOperatorIntent` (`ux/execution-contract.ts`). That owns BUILD / MODIFY / LAUNCH / OPERATE classification. Production Go Live runs `executeProductionLaunchJob`. Ecommerce and SaaS now share that job. Output sites are **acceptance fixtures**.

| Layer | Status |
| --- | --- |
| Genuinely implemented | OTP identity (PocketBase-backed, hidden), BusinessSpec, conductor BUILD, PREVIEW_EDIT, frozen artifacts, production job (classify→provision→generate→wire→verify→deploy→smoke→LIVE), ecommerce Commerce ABI + checkout, SaaS auth/records shell, session projectRef 403 isolation, five-tool catalog + HTTP primitive reject, BusinessRuntimeState injection, **store commands + storefront projection** (product.create/update, **variant.create**, inventory.update, **collection.create/assign**, order.status paid/failed, **order.fulfill**). Payment and fulfillment are separate. **Phase 2B catalog is live on `09179082d`:** variant is the purchasable unit (optionless products persist a distinct default variant). |
| Partially implemented | SaaS (OTP + organizations CRUD shell, not a domain product), payments (`connectGateway` exists; not in this live FTU), Control Center, claim-integrity (library + tests; not a live speech interceptor). Discounts/SEO not this slice. Refunds not implemented (`paid → refunded` rejected). Shopify-class catalog **partially live** (variants + collections + guest checkout by variantId); not a full Shopify product. |
| Stubbed | IMPROVE / workforce, `packages/adapters/pocketbase` physical move (ADR 0008), dedicated `/api/os/v1/business/launch` (still aliases) |
| Fake/mocked | LOCAL 20-store ecommerce-cert loop (mocked guided/launch; now PASS). Live cert OTP uses a **.248 sqlite password patch** — not the customer email path |
| Broken / red | `builder.indobase.fun` CFOS health **timed out** (classic Remix staging; not this OS). |
| Production-ready | **No as a product.** SHA `09179082d` certified C6 variants + C5 regression. NorthPeak/Apex are disposable fixtures. |
| NOT production-ready | Payments FTU, `main` promotion, IMPROVE, arbitrary verticals beyond ecommerce/saas/landing, SaaS beyond a thin app shell, **Shopify-class catalog as a live product** (discounts/SEO/refunds still out) |

**Certification (live, 2026-08-14):**

| Gate | Result | Evidence |
| --- | --- | --- |
| Shopify-class commerce | ❌ | Live C6 proves variants + collections + variantId checkout. Discounts, SEO, refunds still out. Apex/NorthPeak are **fixtures**, not a product bar. |
| Fresh C6 catalog | 21/21 | SHA `09179082d`, fixture `rosha0793de702`, live `https://apex-793de702.sites.indobase.in`, Apex Runner **1 product / 5 variants**, guest checkout variant `izywrs7jtp3vxe5` (size 9), order `ub5bjqll14oco6o` |
| Fresh C5 commerce operate | 21/21 | SHA `09179082d`, fixture `rosh2c7f35d547`, live `https://northpeak-7f35d547.sites.indobase.in`, order `cliz2kb5pgwzzay` **fulfillmentStatus=fulfilled** and **paymentStatus=paid** |
| Fresh C5 (prior) | 21/21 | SHA `82c44213b` — superseded by `09179082d` |
| Fresh C5 (fulfillment bug) | 21/21 | SHA `2c80c45b0` — “mark fulfilled” overloaded payment as paid; superseded |
| Fresh ecommerce FTU | 15/15 | SHA `980b75bbb`, fixture `rosh505593bb90` |
| Fresh SaaS FTU | 15/15 | SHA `980b75bbb`, fixture `rosh207367bc64` |
| Fresh website/landing FTU | 20/20 | SHA `980b75bbb`, fixture `rosh49f1cc69bc` |
| Security | 12/12 + C5 403 | prior pack + forged `urbanthread` 403 on C5 |
| LOCAL bridge suite | 217/217 | `indobase-builder-cfos/bridge` `pnpm test` |
| LOCAL platform | 80/80 | `packages/platform` `pnpm test` |

**Biggest blocker to the 10-minute arbitrary-business goal:** execution profiles only exist for **ecommerce**, **thin SaaS**, and **landing**. A non-store, non-SaaS, non-landing idea does not get a real capability graph. Secondary: `main` is behind live.

**Do not confuse “NorthPeak HTML works” with “Builder is production-ready.”**

---

## 2. Current architecture (from code)

```text
Browser ── CFOS SPA (/os/app) ── chat + gadgets + preview iframe
                │
                ▼
     indobase-builder-cfos bridge :8791  (.249 Swarm)
                │
    ┌───────────┼───────────────┬──────────────────┐
    │           │               │                  │
 begin-turn   /api/session   tools HTTP      static launch root
    │           │               │            /var/lib/indobase/launches
    ▼           ▼               ▼
 applyOperatorIntent     five tools /          Traefik *.sites.indobase.in
    │                    primitives reject
    ├── BUILD  materializePreview
    ├── MODIFY mutateHeroHeadline + writeDraftPreview
    ├── LAUNCH executeProductionLaunchJob
    └── OPERATE BusinessRuntimeState snapshot
         └── store commands (internal): product.create/update, variant.create, inventory.update, collection.create/assign, order.status, order.fulfill
                └── storefront projection: bake catalog snapshot into index.html; live grid still prefers commerce.products.list()
                │
                ├── guidedBackend (in-process, not agent)
                ├── PocketBase shared instance (.248)  ← engine, not product
                ├── Studio :8080  ← Platform API / billing / prompt meter (hidden)
                └── CFOS workerd :8787  ← LLM agent runtime
```

| Component | Purpose | Owner | Inputs | Outputs | Source of truth | Dependencies | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CFOS SPA | Customer OS shell | CFOS runtime `.249` systemd `indobase-cfos-runtime` | chat, gadgets | UI | not the data store | bridge `/api/session`, `/api/os/*` | live |
| Chat | Command center | `begin-turn` + CFOS agent | user message | execution + agent_hint | `applyOperatorIntent` then LLM report | prompt quota via Studio | live |
| Agent runtime | LLM + tool calls | CFOS workerd + `packages/agent-runtime` | agent_hint, 5 tools | narration, tool HTTP | must not own BUILD | OpenRouter | live; tools physically limited |
| Conductor | BUILD first generation | `applyOperatorIntent` create_business | intent | spec, files, preview | `rememberBusinessSpec` + draft files | `materializePreview` | live |
| BusinessSpec | identity of the business | `ux/business-spec.ts` | prompt | name, type, vertical | in-memory + rehydrate from job | planner must not overwrite | live |
| BusinessRuntimeState | operate truth | `@indobase/platform` `runtime-state.ts` + `toBusinessRuntimeState` | spec, preview, job, orders | injected hint | snapshot per turn | commerce/PB for orders | live for store; SaaS orders empty |
| Modify | PREVIEW_EDIT | `applyPersistedPreviewEdit` | headline request | new hash | draft `index.html` | `mutateHeroHeadline` | live |
| Launch | production job | `executeProductionLaunchJob` | frozen html, spec | `*.sites.indobase.in` | job store | guided + `launchStaticBusiness` | live ecom+saas |
| Operate | quote state | agent + `composeRuntimeStateHint` | runtime | chat | orders/products from snapshot | Ask AI SCREEN | live ecom |
| Catalog projection | persist after product/inventory/collection mutate | `persistCatalogProjection` + `injectStorefrontProductSnapshot` | store command snapshot | preview + live `index.html` | disk artifact + `GET /api/os/commerce/products` + `/collections` | session projectRef | live C6 SHA `09179082d` |
| PocketBase | identity + records + shop | managed backend `.248` | appId = projectRef | collections | PB sqlite | never customer-named | live engine |
| Preview | `/live/{ref}/` | `static-launch.ts` `writeDraftPreview` | files | HTTP 200 | disk artifact | Traefik sites | live |
| Production jobs | stage machine | `production-launch/pipeline.ts` | session | LIVE or blocked | `job-store.ts` | smoke fetch live URL | live |
| Control Center | operator chrome | `commerce/http.ts` + branding TSX | cookie session | products/orders | session projectRef | 403 on forged ref | live store |
| Studio | billing, prompt meter, Platform API | `apps/studio` `.249` | SaaS org | quota, OTP fallback | `saas.*` | **legacy on customer path** | required hidden adapter |
| `.249` | control plane | Swarm | images | Studio, CFOS bridge, www | — | — | prod OS host |
| `.248` | data plane + PB | compose/tenants | — | PocketBase, Kong | — | OTP patch used in cert | prod data |
| Hostinger `.fun` | Studio/Remix staging | `deploy-staging-hostinger.sh` | — | `builder.indobase.fun` | **not CFOS** | timed out `/sso/health` | legacy for this product |

**Legacy (do not extend):** Remix `indobase-builder/`, Studio as destination, `/api/os/launch` static-only `handleStaticGoLive` when used as draft, UrbanThread historical workspaces, “Open Studio” CTAs on the OS path, per-business PocketBase provisioner.

---

## 3. Source of truth / state model

| Object | Authoritative store | Mutators | Notes |
| --- | --- | --- | --- |
| **BusinessSpec** | `getBusinessSpec` / `rememberBusinessSpec` (`ux/business-spec.ts`) | `applyOperatorIntent` create; `newJob` infers if missing | `resolveAuthoritativeAppType({ specType, jobType })` **prefers spec**. Job metadata must not rewrite kind (`identity-authority.test.ts`) |
| **BusinessRuntimeState** | composed each turn `toBusinessRuntimeState` (`ux/agent-truth.ts`) from spec + preview + job + snapshot | not a writable table | ADR 0008. Injected on `/api/session` and begin-turn `agent_hint` |
| Session | signed cookie / agent principal (`auth.ts`) | OTP verify | `projectRef` from session wins; query/header/body conflict → **403** |
| Preview | disk + `runtime.preview` | conductor + PREVIEW_EDIT | `resolvePreviewGate` — URL shape is not ready |
| Artifact | `index.html` under launch root | writeDraftPreview, job generate/wire, catalog projection | freeze hash when ABI + real `<h1>`. Live storefront **lists via `commerce.products.list()`**; baked `let products` is fallback and is rewritten after catalog mutations. |
| Production job | `job-store.ts` | `executeProductionLaunchJob` | statuses queued/running/blocked/live |
| Live | job.url + Traefik | deploy stage | `claim_live` only if smoke OK |
| Orders/catalog | PocketBase + commerce HTTP | checkout, admin | anonymous catalog requires **live job** for that ref |
| Identity | IdentityAdapter façade; PB OTP impl | `/auth/start` `/auth/verify` | session code must not call PB HTTP (ADR 0008; façade in bridge) |

**Can job overwrite BusinessSpec?** Spec type wins via `resolveAuthoritativeAppType`. `newJob` still *infers* a spec if none exists. `specFromProductionJob` can fill type from `job.appType` during rehydrate — dangerous if spec missing; identity tests cover the overwrite case when spec exists.

**Can the model invent state?** It can narrate anything. Mitigation: `claim-integrity.ts` detectors + agent_hint. **Not** a hard filter on every LLM token in production. Live Ask AI for NorthPeak quoted real orders.

**Can UI claim missing state?** Preview gate + `agentMayClaimPreview/Live` exist. Chrome historically drifted (UrbanThread `rosh76e90375b6` — do not reuse).

**Can chat claim success without execution?** Yes if the model ignores hints. Conductor still runs BUILD on begin-turn independently of the model (`applyOperatorIntent`). Launch is not “the model deployed”; the job did.

**Turn injection:** `loadAuthoritativeLaunchFacts` + `composeAgentHintForSession` + `execution.agent_context` (`index.ts` begin-turn ~1980).

---

## 4. Agent tool boundary

**Declared public surface** (`production-launch/agent-surface.ts` `AGENT_FACING_TOOL_NAMES`):

1. `launchProductionApp` → `POST /api/os/tools/launchProductionApp` and `POST /api/os/apps/launch` → `handleProductionLaunch` → `executeProductionLaunchJob`
2. `launchBusiness` → `POST /api/os/tools/launchBusiness` → **if not draft:** same `executeProductionLaunchJob`; **if `production:false`:** `executeLaunchBusinessTool` static only
3. `connectGateway`
4. `productionChecklist`
5. `promptQuota`

**Physical enforcement:** `rejectAgentPrimitiveIfNeeded` — AgentTool requests send `X-Indobase-Agent-Username`. Primitive paths in `PLATFORM_PRIMITIVE_TOOL_PATHS` return `not_an_agent_tool` with business-language copy. Cookie/in-process conductor **can** call primitives. Tests: `agent-primitive-guard.test.ts`.

**Hidden / conductor-only:** `guidedBackend`, `ensureLogin`, `ensureDatabase`, `applySchema`, `setupShopCatalog`, `wireCheckout`, `placeTestShopOrder`, image tools. Still present as HTTP routes for the job; **not** in the five-name catalog.

**Do not treat prompt FORBIDDEN as the boundary.** The header+path reject is the boundary. Catalog omission is the second.

**Hint bug:** `session-payload.ts` still tells the model `launchBusiness` is preview/draft only. Implementation: non-draft `launchBusiness` **is** production. Live cert used `POST /api/os/tools/launchBusiness` and got LIVE.

---

## 5. Turn ownership

| Turn | Expected owner | Actual |
| --- | --- | --- |
| BUILD | Conductor | `applyOperatorIntent` `create_business` → `materializePreview`. Agent must not rebuild (`execution-contract` + tests). |
| MODIFY | Command system | `preview_edit` → `mutateHeroHeadline` + `writeDraftPreview`. Live: hash changed. |
| LAUNCH | Execution / conductor | begin-turn `launch_production` **and** tool HTTP both call `executeProductionLaunchJob`. |
| OPERATE | BusinessRuntimeState | `operate` / `SCREEN` — agent quotes snapshot. Catalog mutations (`product.create` / `product.update` / `inventory.update`) run inside `applyOperatorIntent` (not a sixth tool). **LOCAL only until FTU.** |
| IMPROVE | future | **not implemented** |

**Duplicate launch paths (must collapse mentally to one production path):**

| Path | Production? |
| --- | --- |
| `applyOperatorIntent` Go Live | yes → job |
| `launchBusiness` default | yes → job |
| `launchProductionApp` / `/api/os/apps/launch` | yes → job |
| `launchBusiness` `production:false` | draft static |
| `POST /api/os/launch` `handleStaticGoLive` | **legacy static** |
| `guidedBackend` optional launchBusiness after seed | job-internal |

**Authoritative production launch:** `executeProductionLaunchJob` (`pipeline.ts`). Everything else is an entry alias or draft.

---

## 6. Business types

`BusinessSpec.businessType`: `'ecommerce' | 'saas' | 'landing'` (`business-spec.ts`).

UI kind: `appTypeToKind` → `ecommerce` | `saas` | `website` | fallback `store` (`ux-conductor.ts`).

Classification: `inferBusinessSpec` + `planProductionApp` / `inferProductionAppType` (`application-planner.ts`). “Launch my app” → saas.

Persistence: `rememberBusinessSpec(projectRef)`. Journey chips from spec (`launch-journey.ts`, session payload). Store vs Launch app vs Launch website.

Launch execution: job `appType` after `resolveAuthoritativeAppType`. Ecommerce → commerce storefront + guided ecommerce mode. SaaS → `ensureSaasAppFiles` + guided `generic`. Landing → skip backend.

**Hard-coded ladders:** ecommerce / saas / landing in spec; extra UI kinds `booking` `ordering` `agency` in conductor nav **without** matching BusinessSpec types — leftover journey chrome, not execution profiles.

Store UI leak into SaaS: latest live SaaS fixture showed Launch app, no Add to cart. Local identity tests cover TutorDesk vs store.

---

## 7. Preview + artifact pipeline

```text
intent → inferBusinessSpec → buildPreviewFiles
  ecommerce: managed shop HTML (Commerce ABI)
  saas: buildProductionSaasHtml (auth+records)
  landing: buildProductionLandingHtml
→ writeDraftPreview → /live/{ref}/
→ PREVIEW_EDIT mutates <h1> → new contentHash
→ freezeWorkspaceArtifact if (commerce ABI | saas ABI) && real h1
→ job generate: keep frozen; else ensure* files
→ wire skipped if keepFrozen
→ deploy hash must equal frozen or artifact_mismatch
```

**Preview ready:** artifact exists **and** HTTP probe not failed (`preview-gate.ts`). Constructed path ≠ ready.

**`/live/{ref}`:** real files on launch root; live cert HTTP 200.

**Iframe:** `preview-embed.ts` CSP/XFO for Builder origin. Live FTU marked iframe preview pass.

**Click-to-edit:** gadget → `PREVIEW_EDIT` message → `mutateHeroHeadline`.

**Failure modes:** placeholder `<h1>your business</h1>` not frozen → generate may rebuild (ecommerce stub replacement is intentional). SaaS without ABI gets shell but **keeps extracted H1**. Frozen ABI + edited H1 must not be replaced (tested + live). If generate runs after freeze with mismatched html → 409 `artifact_mismatch`.

---

## 8. Production launch

**Entry:** operator “Launch my store/app” or tool `launchBusiness` / `launchProductionApp`.

**Job stages:** classify, contract, provision (`executeGuidedBackend`), generate, wire, verify (`assertLaunchArchitectureReady`, ecommerce release gate), deploy (`executeLaunchBusinessTool` → `launchStaticBusiness` + Traefik `*.sites.indobase.in`), smoke (`fetch` live HTML markers), LIVE.

**Hosting:** `.249` bind `/var/lib/indobase/launches`, Traefik `sites-indobase.yml`, wildcard TLS.

**SSL:** wildcard `*.sites.indobase.in` (infra). Custom domain path exists in launch tool; not in latest FTU.

**Health:** smoke in-job; `/sso/health` for bridge.

**Rollback:** not a customer verb. Swarm rolls previous CFOS tasks; site files are not version-rolled automatically.

**Idempotency:** `jobId` reuse; latest job per workspace `GET /api/os/apps/launch`. Duplicate launch re-runs stages; frozen html should republish same artifact.

**Go Live is one operator command** in the happy path (chat or chip). Internally many stages. Agent must not pick them.

**Blocked:** 409 + `humanizeLaunchFailure` — no invented URL (`claim_live` false).

---

## 9. PocketBase / backend model

**Product language:** Add login, products, customers, payments.  
**Engine:** shared PocketBase, collections prefixed per `projectRef` (`pocketbase/managed.ts`, `architecture.ts`).

**Exposed to agent:** not PocketBase. Five tools + BusinessRuntimeState.  
**Exposed to users:** storefront Commerce ABI (`window.indobase.commerce`), SaaS page uses `/api/collections` + `__INDOBASE_ENV__` in HTML (implementation leak in **fixture HTML**, not chrome). Operator copy audited in FTU lexicon tests.

**Facades:** Identity / BusinessData / Capability in `packages/platform` + thin CFOS wrappers. Physical `packages/adapters/pocketbase` **not moved**.

**Isolation:** collection prefix + session 403. Anonymous catalog only if live production job for that ref (`commerce/http.ts`).

**Leakage risk:** wire-proof error strings mention collections/prefix (operator-facing on failure). `workspace-html.ts` hides tool names in chips. SaaS shell still talks “organizations” in the fixture.

---

## 10. Security / isolation

| Control | Unit | Live 2026-08-14 `ecc931ddb` |
| --- | --- | --- |
| Session-bound Control Center | pass (`control-center-auth.test.ts`) | **LIVE VERIFIED** A+A 200 |
| Forged `?projectRef=` | pass | **LIVE** 403 |
| `X-Indobase-Project-Ref` | pass | **LIVE** 403 |
| Products/checkout/OTP/orders conflict | pass | **LIVE** 403 |
| Logout | pass | **LIVE** 401 |
| Anonymous published catalog | pass | **LIVE** 200 own store |
| Cross-workspace spec/artifact | pass (`execution-contract` isolation test) | **NOT VERIFIED** as a second live pair this run (historical A+B on store session vs `urbanthread`) |
| SaaS A+B products | — | **LIVE** 403 |
| OTP brute / DPDP | — | **NOT VERIFIED** this run |
| CSRF / cookie flags | — | **NOT VERIFIED** this run |

Never mark secure from unit tests alone. Live 12/12 is the current verified isolation pack for commerce session + catalog.

---

## 11. Acceptance tests / certification matrix

| AREA | TEST | PASS/FAIL | LOCAL/LIVE | SHA | EVIDENCE | BLOCKER |
| --- | --- | --- | --- | --- | --- | --- |
| LOCAL suite | `pnpm test` bridge | 217/217 PASS | LOCAL | `09179082d` | Phase 2B | — |
| C6 catalog | `/tmp/p01-c6-catalog-cert.py` | 21/21 | LIVE | `09179082d` | `rosha0793de702` 1 product 5 variants | disposable; Apex fixture |
| C5 commerce operate | `/tmp/p01-c5-commerce-cert.py` | 21/21 | LIVE | `09179082d` | `rosh2c7f35d547` fulfill≠paid | disposable; NorthPeak fixture |
| Five-tool | `agent-primitive-guard.test.ts` | PASS | LOCAL | same | physical reject | — |
| FTU logic | `ftu-journey.test.ts` | PASS | LOCAL | same | 16-step ecom path | — |
| Execution A–Q | `execution-contract.test.ts` | PASS | LOCAL | same | BUILD/MODIFY/LAUNCH/OPERATE | — |
| Identity | `identity-authority.test.ts` | PASS | LOCAL | same | saas/website/ecom kinds | — |
| Production job | `production-launch.test.ts` | PASS | LOCAL | same | freeze store/SaaS/landing H1 | — |
| Store FTU | `/tmp/p01-fresh-os-cert.py` | 15/15 | LIVE | `980b75bbb` | `rosh505593bb90` | disposable |
| SaaS FTU | same script | 15/15 | LIVE | same | `rosh207367bc64` | disposable; not a tutoring product |
| Website FTU | same script | 20/20 | LIVE | same | `rosh49f1cc69bc` | disposable; not a Harbor product |
| Security | same script | 12/12 | LIVE | same | store session + SaaS A+B | — |
| Preview/modify/launch/operate/checkout/catalog/Ask AI | store+saas live | PASS | LIVE | same | — | — |
| Claim integrity | `claim-integrity.spec.ts` | PASS | LOCAL | — | not wired as response filter | — |
| Failure recovery | humanize + blocked job tests | PASS local | LOCAL | — | live repair loop **NOT VERIFIED** | — |
| Payments | connectGateway | **NOT IN LIVE FTU** | — | — | — | P1 |

**“Production-ready” currently means (engineering):** live SHA matches git; ecommerce **and** SaaS fresh fixtures complete the chat→live→operate loop; security 12/12; five-tool physical; freeze integrity. **It does not mean:** arbitrary vertical, website class live, payments, LOCAL 20/20, `main` promoted, IMPROVE, or Naïve-class breadth.

---

## 12. Current live certification state

**Verifiable now:** health JSON version `09179082d` = live CFOS (full SHA `09179082df33d7373fe9987d3bead47a862fc56f`).

**Latest live fixtures on this SHA (disposable, do not polish):**

- C6 store: `rosha0793de702` / Apex / `https://apex-793de702.sites.indobase.in` / order `ub5bjqll14oco6o` variantId `izywrs7jtp3vxe5` (size 9)
- C5 store: `rosh2c7f35d547` / NorthPeak / `https://northpeak-7f35d547.sites.indobase.in` / order `cliz2kb5pgwzzay` payment=paid fulfillment=fulfilled

**Do not use:** `2c80c45b0` fixture `roshd84a016c89`, `980b75bbb` fixtures, `ecc931ddb` fixtures (`roshff8c059caa`, `rosh3148d75498`), `rosh76e90375b6`, `urbanthread.sites`, `rosh030e691864`.

**Website live:** VERIFIED on SHA `980b75bbb` only.

---

## 13. Competitive context (thesis only)

Thesis: “Tell Indobase the business. It builds, launches, operates it.”

Architecture **supports** that for **two execution profiles** (store, thin SaaS) plus a landing shell. Differentiation vs coding agents is the **owned lifecycle + runtime state + launch job**, not a bigger tool catalog.

Gaps vs the thesis: IMPROVE absent; SaaS is not a real vertical app; no workforce; payments not in the 10-minute path; website uncertified live; agent still has two launch tool names.

Do not add tools to look more like an AI builder.

---

## 14. 10-minute business test (NorthPeak)

| Step | Who | Human? | Current |
| --- | --- | --- | --- |
| T+0 intent in chat | operator | no | “Build me a premium sneaker store called NorthPeak. Start building.” |
| Account | OTP | **yes (email code)** | Cert patched PB `_otps` on `.248` — **not customer** |
| Classification | conductor | no | ecommerce / NorthPeak |
| BusinessSpec | conductor | no | persisted |
| Generation | conductor | no | shop HTML |
| Preview | `/live/{ref}/` | no (iframe) | HTTP 200 |
| Modify | PREVIEW_EDIT or click | optional click | hash changes |
| Launch | one Go Live / launchBusiness | chip or sentence | job LIVE |
| Live URL | Traefik | no | `*.sites.indobase.in` |
| First customer action | anonymous checkout | open live URL | 200 + order |
| Operate | SCREEN / Ask AI | sentence | quotes orders |

**Ideal:** CHAT → BUILD → PREVIEW → MODIFY → GO LIVE → OPERATE. No Studio. No product switch. **Today that path works for a sneaker store and a thin SaaS on this SHA**, after OTP.

Still requires: account OTP; optional click-to-edit; cert/debug still used internal APIs (`/api/session`, job GET) — customers should not.

---

## 15. Remaining architectural debt

**P0 — blocks calling Builder production-ready as a product**

- `origin/main` ≠ live OS SHA (promotion not done)
- Arbitrary intent outside ecommerce/saas/landing has no execution profile

**P1 — scale / major capability**

- SaaS shell ≠ domain SaaS (records/orgs only)
- Payments / `connectGateway` not in FTU
- **Phase 2B commerce:** variants + collections **live on `09179082d`**. Discounts, SEO, refunds still out. Shopify-class remains ❌.
- IMPROVE / workforce frozen on purpose
- PocketBase env in SaaS HTML; adapters not extracted
- Studio still on OTP/billing/quota critical path
- Live failure-repair loop not recertified
- `handleStaticGoLive` leftover

**P2 — polish**

- Control Center vs chat dual chrome
- Extra journey kinds (booking/agency) without spec types
- Operator-facing wire error strings
- Hostinger `.fun` not OS

**P3 — future**

- Dedicated `business.launch` route rename
- `packages/adapters/*` move
- Custom domains in FTU
- Per-tenant isolate PB

**Do not build yet:** sixth agent tool, TutorDesk/NorthPeak feature work, per-business PB provisioner, Studio as OS destination, workforce/P1 complexity expansion, Remix Builder features.

---

## 16. Next 3 engineering slices (Builder, not fixtures)

### Slice 1 — Unify launch semantics + promote `main` only after website live FTU

- **WHY:** hints lie; website class uncertified; git split brain.
- **FILES:** `session-payload.ts`, `workspace-html.ts`, `index.ts` `handleStaticGoLive`, landing preview/job, live cert script.
- **ARCHITECTURE:** one production entry; landing freeze like others if applicable.
- **ACCEPTANCE:** fresh website fixture 200 live; hints say launchBusiness runs the job; optional `main` only when asked.
- **RISKS:** landing freeze vs no-ABI pages.
- **DONE:** live website FTU + hint/tests agree; ecommerce+saas still green.

### Slice 2 — LOCAL 20-store evidence pack honest or deleted from release gate

- **WHY:** 198/199 fails the “full LOCAL suite” gate for a reason that is not FTU.
- **FILES:** `delivery/ecommerce-certification.ts` / `.test.ts`, job evidence fields.
- **ARCHITECTURE:** evidence must match what the job actually records (`failed_payment_recovery_ui` may be out of Core v1).
- **ACCEPTANCE:** either 20/20 with real evidence or the test scoped to Core v1 and documented.
- **RISKS:** fake-green.
- **DONE:** LOCAL suite matches the live definition of ready.

### Slice 3 — Payments on the same lifecycle (not a new tool)

- **WHY:** 10-minute store still stops at pending checkout.
- **FILES:** `connect-gateway-tool.ts`, commerce checkout, FTU.
- **ARCHITECTURE:** capability after LIVE; still five tools.
- **ACCEPTANCE:** fresh store: checkout → paid or honest pending + operate quotes payment state; no PocketBase in copy.
- **RISKS:** Razorpay BYOK, India vs international.
- **DONE:** one live store fixture with payment state in BusinessRuntimeState.

---

## 17. File-level map

| Subsystem | Files | Symbols | Responsibility |
| --- | --- | --- | --- |
| Bridge HTTP | `indobase-builder-cfos/bridge/src/index.ts` | `handleProductionLaunch`, `handleLaunchBusinessTool`, begin-turn | OS API |
| Execution contract | `ux/execution-contract.ts` | `applyOperatorIntent` | BUILD/MODIFY/LAUNCH/OPERATE |
| Store commands | `ux/store-commands.ts` | `executeStoreCommand` | Internal catalog/commerce skills (not tools) |
| Spec | `ux/business-spec.ts` | `inferBusinessSpec`, `rememberBusinessSpec` | identity |
| Runtime persist | `ux/runtime-store.ts` | `rememberWorkspaceRuntime` | preview/spec/commands |
| Truth | `ux/agent-truth.ts`, `packages/platform/src/business/runtime-state.ts` | `toBusinessRuntimeState`, `composeBusinessRuntimeStateHint` | operate |
| Claims | `packages/platform/src/business/claim-integrity.ts` | `detectFabricatedClaims` | speech vs state |
| Preview | `ux/preview-artifact.ts`, `ux/preview-gate.ts`, `static-launch.ts` | `ensureSaasAppFiles`, `ensureEcommerceStorefrontFiles`, `writeDraftPreview` | files + HTTP |
| Job | `production-launch/pipeline.ts` | `executeProductionLaunchJob`, `freezeWorkspaceArtifact` | LIVE |
| Planner | `production-launch/application-planner.ts` | `planProductionApp`, `resolveAuthoritativeAppType` | appType |
| Tools | `production-launch/agent-surface.ts`, `agent-primitive-guard.ts` | `AGENT_FACING_TOOL_NAMES` | five-tool |
| Launch static | `launch-business-tool.ts`, `static-launch.ts` | `executeLaunchBusinessTool`, `launchStaticBusiness` | publish files |
| Guided | `guided-backend-chain.ts` | `executeGuidedBackend` | provision |
| Commerce | `commerce/http.ts`, `control-center-auth.ts` | session 403, anon catalog | store data |
| Session JSON | `session-payload.ts` | `buildSessionPayload` | agent_hint + tools |
| Conductor UX | `ux-conductor.ts` | `appTypeToKind`, `controlCenterNav` | journey |
| Kernel | `packages/platform/src/*` | Platform contracts | no product UI |
| Identity live | `auth.ts` | Session, BackendConfig | SSO/OTP |
| Embed | `preview-embed.ts` | iframe headers | preview |

---

## 18. Handoff to ChatGPT (machine-readable)

```text
CURRENT_PRODUCT: Indobase OS — agentic business operating system (chat builds/launches/operates a business). Output sites are acceptance fixtures.
CURRENT_ARCHITECTURE: CFOS shell + Node bridge on .249; conductor applyOperatorIntent; production job executeProductionLaunchJob; PocketBase shared engine on .248; Studio hidden for quota/billing/Platform API.
CURRENT_SHA: 980b75bbb50f432cd4a1b627f26569700347d84d
CURRENT_BRANCH: staging (origin/staging). origin/main=da5a1c6c05bc7ab22af2717f60c83436254f3c95
DEPLOYED_SHA: 980b75bbb50f432cd4a1b627f26569700347d84d (builder.indobase.in /sso/health 2026-08-14)
CURRENT_CERTIFICATION: Three execution profiles certified on this SHA only. LIVE store 15/15 + saas 15/15 + landing 20/20 + security 12/12. LOCAL 201/201. NOT product-certified (no main, no payments, no arbitrary vertical).
PUBLIC_AGENT_TOOLS: launchProductionApp, launchBusiness, connectGateway, productionChecklist, promptQuota
BUILD_OWNER: conductor applyOperatorIntent / materializePreview
MODIFY_OWNER: command PREVIEW_EDIT mutateHeroHeadline
LAUNCH_OWNER: executeProductionLaunchJob (launchBusiness non-draft and launchProductionApp are aliases)
OPERATE_OWNER: BusinessRuntimeState + agent report
SOURCE_OF_TRUTH: BusinessSpec for identity; BusinessRuntimeState for operate claims; job for live URL; session.projectRef for authz
BACKEND_ENGINE: PocketBase (invisible); Commerce ABI for stores; SaaS HTML uses records/OTP
PREVIEW_PATH: writeDraftPreview → https://sites.indobase.in/live/{projectRef}/
PRODUCTION_PATH: executeProductionLaunchJob → launchStaticBusiness → https://{subdomain}.sites.indobase.in
BUSINESS_TYPES: ecommerce | saas | landing (UI website=landing; extra nav kinds booking/agency unused by spec)
KNOWN_P0: main behind live; no execution profile beyond 3 types
KNOWN_P1: thin SaaS; payments FTU; IMPROVE absent; Studio still on quota path; leftover static Go Live
KNOWN_PARKED: workforce/P1 complexity; sixth tool; fixture polishing; per-business PB provisioner
LATEST_TEST_COUNTS: LOCAL 201/201; LIVE store 15/15; LIVE saas 15/15; LIVE landing 20/20; LIVE security 12/12
LATEST_LIVE_FIXTURES: rosh505593bb90 NorthPeak; rosh207367bc64 TutorDesk; rosh49f1cc69bc Harbor Studio (all disposable, SHA 980b75bbb only)
NEXT_ENGINEERING_SLICE: Parked P1 (payments / workforce). Do not polish fixtures. Promote main only when asked.
PUBLIC_AGENT_TOOLS: launchProductionApp, launchBusiness, connectGateway, productionChecklist, promptQuota
BUILD_OWNER: conductor applyOperatorIntent / materializePreview
MODIFY_OWNER: command PREVIEW_EDIT mutateHeroHeadline
LAUNCH_OWNER: executeProductionLaunchJob (launchBusiness non-draft and launchProductionApp are aliases)
OPERATE_OWNER: BusinessRuntimeState + agent report
SOURCE_OF_TRUTH: BusinessSpec for identity; BusinessRuntimeState for operate claims; job for live URL; session.projectRef for authz
BACKEND_ENGINE: PocketBase (invisible); Commerce ABI for stores; SaaS HTML uses records/OTP
PREVIEW_PATH: writeDraftPreview → https://sites.indobase.in/live/{projectRef}/
PRODUCTION_PATH: executeProductionLaunchJob → launchStaticBusiness → https://{subdomain}.sites.indobase.in
BUSINESS_TYPES: ecommerce | saas | landing (UI website=landing; extra nav kinds booking/agency unused by spec)
KNOWN_P0: website live uncertified; LOCAL 20-store pack red; main behind live; launchBusiness hint contradiction; no execution profile beyond 3 types
KNOWN_P1: thin SaaS; payments FTU; IMPROVE absent; Studio still on quota path; leftover static Go Live
KNOWN_PARKED: workforce/P1 complexity; sixth tool; fixture polishing; per-business PB provisioner
LATEST_TEST_COUNTS: LOCAL 198 pass 1 fail; LIVE store 15/15; LIVE saas 15/15; LIVE security 12/12
LATEST_LIVE_FIXTURES: roshff8c059caa NorthPeak; rosh3148d75498 TutorDesk (disposable)
NEXT_ENGINEERING_SLICE: Unify launch hints + live website FTU on same job lifecycle (do not polish TutorDesk/NorthPeak)
```

### WHAT CHATGPT SHOULD NOT ASSUME

- Studio is not the customer product and not the launch destination.
- Remix `indobase-builder` is not the OS under certification.
- `builder.indobase.fun` is not this CFOS.
- `launchBusiness` without `production:false` runs `executeProductionLaunchJob` (same job as `launchProductionApp`).
- UrbanThread / `rosh76e90375b6` / old 409 TutorDesk jobs are not evidence.
- Green NorthPeak HTML ≠ Builder production-ready.
- Five-tool freeze is physical (`X-Indobase-Agent-Username` + path), not just a prompt.
- PocketBase is an engine; do not add “connect database” UX.
- Do not add agent tools.
- Do not implement IMPROVE/workforce until P0 class coverage is honest.
- Do not treat `packages/adapters/pocketbase` as already extracted.
- Live cert OTP used a VPS sqlite patch; customers use email OTP.
- `origin/main` is not the live OS SHA as of this dossier.
- Docs (`INDOBASE-OS.md`, ADRs) describe intent; **this file** describes 2026-08-14 implementation. If they conflict, prefer code + live health + the cert table above.
```

This file is the handoff contract. I did not change application code, git, or deploy.