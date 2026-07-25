# Indobase Design — NOTICE

Indobase Design is built on **Penpot** (<https://github.com/penpot/penpot>),
licensed under the **Mozilla Public License 2.0 (MPL-2.0)**.

- Upstream copyright: © KALEIDOS INC and Penpot contributors.
- MPL-2.0 full text: <https://www.mozilla.org/en-US/MPL/2.0/>
- Engine version pinned in `docker/deploy/.env.example` (`PENPOT_VERSION`).

## How this deployment relates to upstream

This directory does **not** vendor a modified copy of the Penpot source.
It deploys the unmodified upstream container images
(`penpotapp/frontend`, `penpotapp/backend`, `penpotapp/exporter`) with:

1. `frontend/` — a build-time **branding overlay** applied on top of the
   upstream frontend image (string/asset substitution in built artifacts,
   plus an additional stylesheet). No MPL-2.0-covered source files are
   modified; per-file license headers in upstream sources are unaffected.
2. `sso-shim/` — an **independent, original work** (Indobase proprietary,
   part of this monorepo) that implements a minimal OIDC provider so Penpot's
   standard OIDC login can be driven by Indobase Studio sessions. It links to
   Penpot only over HTTP and includes no Penpot code.

MPL-2.0 is a file-level copyleft: obligations attach to modified MPL-covered
files. Should we later fork and modify Penpot source files, those files remain
MPL-2.0 and their source must be made available; see the upstream repository
for the canonical source of the deployed engine version.

Customer-facing branding is **Indobase Design**; "Penpot" is used here only
for license attribution and upstream reference.
