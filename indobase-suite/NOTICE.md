# Third-party attribution

Indobase Workspace embeds [ONLYOFFICE Document Server](https://github.com/ONLYOFFICE/DocumentServer)
(AGPL-3.0) via the official Docker image (`onlyoffice/documentserver`). Source and license terms
are published by Ascensio System SIA. This repository does **not** vendor the full DocumentServer
tree; runtime pulls the container image.

Indobase Meetings embeds self-hosted video conferencing via official Meet Docker images
(`jitsi/web`, `jitsi/prosody`, `jitsi/jicofo`, `jitsi/jvb`). This repository does **not** vendor
those trees. **Preferred deploy path:** `indobase-meet/` (first-class Indobase Meet product).
Legacy `docker/deploy/docker-compose.meetings.yml` is superseded by that stack.

Indobase Calendar runs self-hosted scheduling via the official community Docker image
(`calcom/cal.diy`, MIT). Upstream project: https://github.com/calcom/cal.diy — this repository
does **not** vendor that monorepo. **Preferred deploy path:** `indobase-calendar/` (first-class
Indobase Calendar product with Studio SSO bridge). Legacy `docker/deploy/docker-compose.calendar.yml`
is a migration pointer only.

Customer-facing product name is **Indobase Workspace** (Files, Docs, Sheets, Presentations,
Meetings → **Indobase Meet**, Calendar → **Indobase Calendar**). Do **not** expose "ONLYOFFICE", "DocumentServer", "Frappe", "Suite",
"Drive", "Writer", "Slides", "Jitsi", "Cal.com", "cal.diy", "Cal", or competitor product
names in user-visible UI, routes, OAuth client names, or email footers.

AGPL obligations for the DocumentServer binary/container remain with the deployed image and its
upstream NOTICE/LICENSE. Keep this file when distributing Indobase Workspace wrappers.

## Community Edition white-label limits

We run DocumentServer **Community Edition** (not Developer / Enterprise). CE does **not** fully
white-label the editor chrome:

- `editorConfig.customization.logo` / `customer` / `about: false` are set by the bridge where the
  API accepts them; CE may still show upstream branding in the About dialog, watermarks, or
  residual chrome strings.
- The public `/welcome` (Community Edition installed) page is **blocked** at Traefik + bridge and
  replaced with an Indobase Workspace page — it must never be customer-visible.
- Shell / file manager / editor host chrome is Indobase-only (`/brand/*` assets).

The Calendar product may still show residual upstream strings in engine chrome
(footer, email templates) until Phase 2; Workspace no longer iframes the engine.

Mail in Workspace launches **Indobase Email** — not a mail client inside Workspace.
Presentations use Workspace slide editing by default; Studio may deep-link **Design** when
`NEXT_PUBLIC_WORKSPACE_SLIDES_VIA_DESIGN=true`.
Workspace **Meetings** / **Calendar** SSO-launch **Indobase Meet** / **Indobase Calendar**.
