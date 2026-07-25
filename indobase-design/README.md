# Indobase Design

In-browser visual design tool for Indobase Marketing (landing pages,
creatives, brand assets). Engine: upstream Penpot images (MPL-2.0 — see
`NOTICE.md`) with an Indobase branding overlay and Studio-only SSO.

| Piece | Path |
|---|---|
| Deploy compose (Vyom `.249`) | `docker/deploy/docker-compose.yml` |
| Branding overlay (frontend wrapper image) | `frontend/` |
| Studio SSO bridge (OIDC shim, no deps) | `sso-shim/` |
| Runbook | `docs/INDOBASE-DESIGN.md` (repo root docs) |

Auth model: **Studio SSO only.** Password login and public registration are
disabled via `PENPOT_FLAGS`; the only entry point is
`https://design.indobase.in/sso/launch#token=…` minted by Studio
(`GET /api/platform/projects/[ref]/design/launch`).

Hosts: `design.indobase.fun` (staging smoke) and `design.indobase.in`
(production, canonical `PENPOT_PUBLIC_URI`), both Traefik-routed on `.249`.
