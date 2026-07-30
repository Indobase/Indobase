# Third-party attribution

Indobase Discuss is built on [Mattermost](https://github.com/mattermost/mattermost) (Team Edition), licensed under **AGPL-3.0**.

We run the official Mattermost Docker images; we do **not** vendor the Mattermost monorepo in this tree. Source is available from the upstream project and via Mattermost’s AGPL compliance channels.

Customer-facing product name is **Indobase Discuss**. Do not expose "Mattermost", "Gameplan", or "Frappe" in user-visible UI, routes, OAuth client display names, or email footers. Keep this NOTICE (and upstream LICENSE references) in the repo.

## Branding controls we set

- `TeamSettings.SiteName` = Indobase Discuss; CustomBrand image disabled (avoids oversized login marks).
- Support / About / Help / Privacy / Terms links point at Indobase / Studio — not upstream.
- Native app download links cleared; open signup and email signup disabled (Studio SSO only).
- Bridge HTML proxy rewrites document `<title>` / favicon and strips `Server` / `X-Version-Id` headers.
- Some in-app About strings remain upstream-hardcoded in Team Edition; we do not fork the webapp to erase every occurrence.
