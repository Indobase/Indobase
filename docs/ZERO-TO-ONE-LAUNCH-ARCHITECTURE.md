# Zero → One Launch Architecture (Indobase OS / CFOS Bridge)

Canonical engineering reference for **chat → live → operate** on `builder.indobase.in`.  
This document merges the product architecture spec with **what is implemented in-repo today**.

---

## 1. Control plane & data flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ OPERATOR BROWSER (builder.indobase.in)                                     │
│  ChatInterface · FollowUpRecommendations · LaunchJourneyCard                 │
└───────────────┬───────────────────────────────┬─────────────────────────────┘
                │ Same-origin HTTP / SSE         │ window.__INDOBASE_JOURNEY__
                ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ INDOBASE-BUILDER-CFOS BRIDGE (Hono on Vyom .249 Swarm)                      │
│  /api/session · /api/agent/begin · /api/os/tools/* · /api/os/launch        │
│  pocketbase/* (guidedBackend, blueprints, shop-admin-html)                   │
└───────────────┬───────────────────────────────┬─────────────────────────────┘
                │ PocketBase REST                  │ Static site registry
                ▼                                  ▼
┌───────────────────────────────┐    ┌──────────────────────────────────────┐
│ backend.indobase.in           │    │ *.sites.indobase.in (Lane 1 static)   │
│ ib_{appId}_products|orders|…  │    │ launchStaticBusiness + site routes    │
└───────────────────────────────┘    └──────────────────────────────────────┘
```

### End-to-end sequence (happy path)

1. Operator describes business in CFOS chat.
2. Bridge `POST /api/agent/begin` — session + prompt quota.
3. Agent runs `guidedBackend` (ecommerce) → PocketBase collections + seed catalog.
4. Bridge returns `admin_html` (managed admin compiler) + `collection_prefix`.
5. Operator clicks **Go Live** → `launchBusiness` / `POST /api/os/launch`.
6. Bridge writes static files, registers subdomain → `https://{slug}.sites.indobase.in`.
7. Journey state advances: live → payments → production checklist.

---

## 2. State machine

| Stage | Meaning | Bridge signal |
| --- | --- | --- |
| `account` | Guest — must verify OTP | `session.guest === true` |
| `preview` | Signed in, storefront draft | implicit after account |
| `backend` | PocketBase wired | `session.backend.rest_url` |
| `live` | Published subdomain | `getLaunchStatus().subdomain` |
| `payments` | Razorpay/Stripe public keys in env | `RAZORPAY_KEY_ID` / `STRIPE_PUBLIC_KEY` |
| `production` | Live + backend + payments | all flags true |

**Implementation:** `indobase-builder-cfos/bridge/src/launch-journey.ts`  
**Session payload:** `session-payload.ts` adds `journey` to `GET /api/session`.  
**UI:** `branding/followups/LaunchJourneyCard.tsx` reads `window.__INDOBASE_JOURNEY__`.

Journey objects expose:

- `stages[]` — `{ id, label, status: done|current|upcoming }`
- `completed_stages[]` — spec alias
- `flags` — `{ is_guest, is_backend_ready, is_live, is_payments_ready, is_production_ready }`
- `next_action` — `{ label, message }` for chip / button injection

---

## 3. PocketBase schema (canonical)

### Naming rule

```
physicalName = "ib_" + sanitizeAppId(projectRef) + "_" + logicalName
sanitizeAppId = lowercase alphanumeric only, max 16 chars
```

Example: project `roshB77a4744fa` → `ib_roshb77a4744fa_products`.

### Ecommerce logical collections

| Logical | Physical | Key fields (canonical) | Access |
| --- | --- | --- | --- |
| products | `ib_{id}_products` | `name`, `slug`, `price`, `currency`, `stock`, `image_url`, `active`, `owner` | public read, auth write |
| orders | `ib_{id}_orders` | `email`, `status`, `total`, `currency`, `items_json`, `owner` | owner-scoped |
| order_items | `ib_{id}_order_items` | `order_id`, `product_slug`, `quantity`, `unit_price`, `owner` | owner-scoped |

**Spec alias map (documentation only — do not rename live collections):**

| Spec name | Canonical field |
| --- | --- |
| `title` | `name` |
| `inventory` | `stock` |
| `is_active` | `active` |
| `customer_email` | `email` |
| `total_amount` | `total` |

**Source:** `bridge/src/pocketbase/blueprints.ts`, applied via `architecture.ts` + `guided-backend-chain.ts`.

---

## 4. Managed admin HTML compiler

**File:** `bridge/src/pocketbase/shop-admin-html.ts` — `buildManagedShopAdminHtml()`

Injects runtime context:

- `window.__INDOBASE_ENV__` — public env (`INDOBASE_RECORDS_BASE`, `INDOBASE_COLLECTION_PREFIX`, …)
- `window.__INDOBASE_CONFIG__` — `{ baseUrl, prefix, collections: { products, orders, orderItems } }`
- `window.__INDOBASE_COLLECTION__(logical)` — resolves physical collection name

Admin fetches `{baseUrl}/{prefix}products/records` and parses PocketBase `{ items: [...] }` via `pbItems()`.

**Never** hand-roll `shop_products` / PostgREST paths in agent-generated admin HTML — use tool-returned `admin_html`.

---

## 5. Follow-up chips & agent policy

### Protocol block

```
<<<INDOBASE_FOLLOWUPS
title: Where should we go next?
Go Live | Call launchBusiness with current project files
Connect Backend | Run guidedBackend mode=ecommerce
INDOBASE_FOLLOWUPS>>>
```

**Parser:** `bridge/src/followups.ts` — `parseFollowUps`, `resolveFollowUps`, `stripLeakedCot`  
**UI:** `branding/followups/FollowUpRecommendations.tsx`  
**Policy seed:** `scripts/seed-format-routing.mjs`, `AGENT_HINT.md`

**Debug API:** `POST /api/os/tools/followups` — body `{ message }` → `{ cleaned_message, parsed, resolved }`.

### UI timing rules

- Show chips when agent turn completes (`completedAgentTurnMessageSeqs`) or agent idle.
- Inject ladder chips when agent omits `INDOBASE_FOLLOWUPS` after deliverables (`injectAssistantTurnFollowUps`).
- Max 4 visible chips (`MAX_VISIBLE_CHIPS`).

---

## 6. Static launch (Lane 1)

**File:** `bridge/src/static-launch.ts` — `launchStaticBusiness()`

- Writes HTML/assets under configured storage dir (env `STATIC_LAUNCH_STORAGE_DIR`).
- Registers routes via site registry / platform deploy (not raw Traefik append in prod).
- Injects `window.__INDOBASE_ENV__` into `.html` files on publish.

**Tool entry:** `launch-business-tool.ts` → `POST /api/os/tools/launchBusiness`.

Lane 1 static launch is preferred before deep fullstack gates; see `docs/adr/0005-two-lane-launch.md`.

---

## 7. Key API routes

| Route | Purpose |
| --- | --- |
| `GET /api/session` | Session + backend snapshot + `journey` |
| `POST /api/agent/begin` | Prompt quota / turn metering |
| `POST /api/os/tools/guidedBackend` | Provision PB + seed + admin_html |
| `POST /api/os/tools/launchBusiness` | Publish to `*.sites.indobase.in` |
| `POST /api/os/tools/wireCheckout` | Payment gateway wiring |
| `POST /api/os/tools/followups` | Parse/inject follow-up chips (debug) |
| `GET /api/health/ready` | Bridge readiness |

---

## 8. Troubleshooting matrix

| Symptom | Likely cause | Verify | Fix |
| --- | --- | --- | --- |
| Tools "Service Unavailable" | `INDOBASE_BRIDGE_URL` → dead localhost | `curl -I https://builder.indobase.in/api/health/ready` | Run `scripts/indobase-cfos-seed-indobase-vars.sh`, restart CFOS service |
| Admin blank / "Unable to load dashboard" | Legacy `shop_products` path or `.records` parser | Network tab: 404 on `shop_products` | Republish with `buildManagedShopAdminHtml()`; use `ib_{id}_products` |
| Follow-up chips missing after stream | `allowFallback` false mid-stream | CFOS ChatInterface patch | `allowFallback={completed \|\| !isAgentActive}` in rebrand script |
| Go Live 403 | Fullstack backend gate | Logs on `launchBusiness` | Use Lane 1 static launch; ensure session + subdomain |
| SPA refresh 404 | Missing workspace plural routes | Traefik / bridge logs | `cfos-spa-shell.ts` wildcard rewrites |
| Catalog empty on live site | Storefront not reading PB env | View source for `__INDOBASE_ENV__` | Republish with env inject; verify `INDOBASE_RECORDS_BASE` |

---

## 9. Tests

| File | Covers |
| --- | --- |
| `bridge/src/launch-journey.test.ts` | Journey stages, flags, completed_stages |
| `bridge/src/followups.test.ts` | Parser, injection, stage gate |
| `bridge/src/pocketbase/shop-admin-html.test.ts` | Admin HTML env + collection prefix |
| `bridge/src/pocketbase/blueprints.test.ts` | Blueprint inference |

Run from repo root:

```bash
cd indobase-builder-cfos/bridge && npm test
```

---

## 10. Deploy & republish checklist

1. Commit bridge + branding + rebrand script changes on **`staging`** (default).
2. Run `node indobase-builder-cfos/scripts/rebrand-cloudflare-os.mjs` in CFOS build.
3. Push staging → smoke `builder.indobase.fun`.
4. For broken prod admin (e.g. Threadline): re-run `listShopOrders` / `launchBusiness` with fresh `admin_html` on `{brand}-admin` subdomain.
5. Promote to `main` / Vyom only when explicitly requested.

---

## Related docs

- `docs/INDOBASE-OS.md` — OS overview
- `docs/adr/0005-two-lane-launch.md` — static vs fullstack lanes
- `docs/BUILDER-GEN3.md` — Gen 3 bridge session model
