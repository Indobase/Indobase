# Builder store launch preview — live error finding

**Date:** 2026-08-14  
**Captured from:** Cursor browser tab `7c31ce`  
**Tab title:** Online Store Launch Preview — Indobase Builder  
**URL:** https://builder.indobase.in/workspace/e93a009c0c674366165f5d14c5d3197056efc715ee5090c391235d7aa50eaaf8  
**Project ref:** `roshbdc1f7ad63`  
**Operator:** signed-in member (`guest: false`, `stage: member`)

## What the operator sees

- Chat says **“Preview is ready”** and **BUILDING / Preview ready — launch your store when you are**.
- Journey: Account done, Preview done, **Store not started**, Launch current, Payments/Ready not started.
- Right pane badge **PREVIEW**, then a **blank white iframe**. No products, cart, or store chrome.
- Agent copy: empty storefront, **will not provision or run test-order**. Chips: Launch store / Go Live / Add a real backend.
- Accessibility tree still has **Create your Indobase account** + OTP fields even though the session is already a member.

## Live evidence (this tab)

| Check | Result |
|--------|--------|
| Preview iframe `src` | `https://builder.indobase.in/live/roshbdc1f7ad63/?ib_edit=1` |
| `/live/{ref}/` GET | 200, `text/html`, lane `preview-embed`, CSP `frame-ancestors 'self'` |
| Storefront HTML | ~35KB shop shell, title `your business`, `__INDOBASE_ENV__` present |
| `INDOBASE_URL` | **empty** |
| `INDOBASE_COMMERCE_URL` | `https://builder.indobase.in/api/os/commerce` |
| Cart code | `localStorage.getItem/setItem` (`indobase.commerce.{ref}.cart`) — `saveCart` is **not** in try/catch |
| Parent → iframe DOM | **`SecurityError`: blocked as cross-origin** (same host `/live/`, still not readable) |
| `window.indobase.commerce` on parent | false |
| `production_job` | **null** |
| `GET /api/os/apps/launch` | **404** `No production launch job for this workspace` |
| `GET /api/os/commerce/products` (session) | **403** `forbidden` |

Iframe sandbox:

```text
allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox
```

Parent still cannot read the frame (`SecurityError` on `Location.href`). Combined with uncaught `localStorage.setItem` in the storefront, the preview paints white.

## Chat bugs (same session)

1. **Agent did not enqueue the production job.** Operator asked for a complete shop (products, cart, checkout, accounts, orders, admin). Job never started.
2. **Agent stalled on preview** and refused `guidedBackend` / `placeTestShopOrder` / Go Live.
3. **Leaked CoT into chat** (three times):  
   `Call for this, prove with placeTestShopOrder, then emit Wire / Go Live chips — do not restart guest/auth`
4. **Journey skipped Store** (catalog/backend) and jumped to Launch while claiming preview ready.
5. **Guest account chrome still in the tree** after sign-in.

## What this is / is not

**Is:** workspace + same-origin draft `/live/{ref}/` embed (not a public `*.sites.indobase.in` URL).  
**Is not:** a live store, a production launch job, or a working commerce session.

## Product rule (already in Builder)

- Draft preview: `launchBusiness` with `production: false` → `/live/{ref}/`.
- Production: `POST /api/os/apps/launch`. Claim a URL only when `status=live` and `claim_live=true`.
- Do not leave the operator on an empty iframe and “tell me when you want it live.”
- Do not leak agent instructions into the chat transcript.

## Operator impact

Looks like a store is ready. It is not. Preview is blank, catalog API is forbidden, no launch job exists. Go Live chips will not produce a certified live URL from this state.
