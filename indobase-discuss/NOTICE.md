# Third-party attribution

Indobase Discuss is built on [Mattermost](https://github.com/mattermost/mattermost) (Team Edition), licensed under **AGPL-3.0**.

We run the official Mattermost Docker images; we do **not** vendor the Mattermost monorepo in this tree. Source is available from the upstream project and via Mattermost’s AGPL compliance channels.

Customer-facing product name is **Indobase Discuss**. Do not expose "Mattermost", "Gameplan", or "Frappe" in user-visible UI, routes, OAuth client display names, or email footers. Keep this NOTICE (and upstream LICENSE references) in the repo.

## Branding controls we set

- `TeamSettings.SiteName` = Indobase Discuss; `CustomDescriptionText` / `CustomBrandText` describe Indobase Discuss.
- `EnableCustomBrand` = true with a **compact PNG** wordmark (~211×40, `bridge/public/brand/indobase-custom-brand.png`) uploaded by bootstrap — never a giant SVG that blows out login layout.
- Support / About / Help / Privacy / Terms links point at Indobase / Studio — not upstream (`PrivacyPolicyLink` env key is `MM_SUPPORTSETTINGS_PRIVACYPOLICYLINK`).
- Native app download links cleared; open signup and email signup disabled (Studio SSO only).
- Bridge HTML proxy (text/html only):
  - Rewrites `<title>`, application-name / apple-mobile-web-app-title, favicons → `/brand/*`.
  - Replaces `#initialPageLoadingScreen` (Mattermost SVG pills / compass) with Indobase mark + “Opening Indobase Discuss…”.
  - Injects CSS to hide/replace sidebar and About logos; injects JS MutationObserver to rewrite safe visible “Mattermost” text nodes.
  - Strips upstream `Server` / `X-Version-Id` and undici `Content-Encoding` / stale `Content-Length` (gzip proxy fix).

## Honest Team Edition limits

Mattermost **Team Edition** does not include Enterprise white-label. Compiled webapp JS still contains the string “Mattermost” (source maps, i18n keys, some About modal copy paths). We do **not** fork or recompile the webapp to erase every occurrence.

What customers should not see in chrome we control: document title, favicon, loading screen, sidebar/header logos, noscript banner, SiteName-driven labels, About/Help/Privacy/Terms destinations, app-download promos.

Residual risk: rare TE About / licensing strings or in-bundle literals that render before our MutationObserver runs, or inside shadow DOM / canvas we cannot rewrite without an Enterprise license or a webapp fork.

### Known-unfixable at the bridge — do not re-investigate

These were audited and confirmed unfixable without forking the webapp. They are recorded here so
nobody spends time rediscovering them:

- **`GET /api/v4/config/client?format=old` is unauthenticated and fingerprints the deployment.**
  It returns `Version` (e.g. `10.5.2`), `BuildNumber`, `BuildHash`, `BuildDate`, `DiagnosticId`,
  `AsymmetricSigningPublicKey` and every `Enable*` flag. Anyone can `curl` it. Rewriting the JSON is
  not an option — the webapp requires the real values and a malformed client config takes the SPA
  down. **Accepted as residual.**
- **Protocol-level fingerprints.** Cookies `MMAUTHTOKEN` / `MMUSERID` / `MMCSRF`, the `/api/v4/*`
  namespace, `/static/*` assets, and the WebSocket at `/api/v4/websocket`. The webapp reads those
  cookie names directly, so renaming them breaks authentication. **Accepted as residual.**

Practical consequence: anyone with DevTools open can identify the upstream engine. Branding hides it
from ordinary product surfaces, not from inspection — and it is not intended to.

