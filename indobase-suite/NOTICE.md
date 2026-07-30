# Third-party attribution

Indobase Workspace embeds [ONLYOFFICE Document Server](https://github.com/ONLYOFFICE/DocumentServer)
(AGPL-3.0) via the official Docker image (`onlyoffice/documentserver`). Source and license terms
are published by Ascensio System SIA. This repository does **not** vendor the full DocumentServer
tree; runtime pulls the container image.

Customer-facing product name is **Indobase Workspace** (Files, Docs, Sheets, Presentations).
Do **not** expose "ONLYOFFICE", "DocumentServer", "Frappe", "Suite", "Drive", "Writer", "Slides",
"Meet", or competitor product names in user-visible UI, routes, OAuth client names, or email footers.

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

Mail in Workspace launches **Indobase Email** — not a mail client inside Workspace.
Presentations use Workspace slide editing by default; Studio may deep-link **Design** when
`NEXT_PUBLIC_WORKSPACE_SLIDES_VIA_DESIGN=true`.
