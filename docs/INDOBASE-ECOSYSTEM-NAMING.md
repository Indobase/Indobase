# Indobase OS — customer-facing naming dictionary

Canonical names for Studio, chooser tiles, launchers, bridge shells, and product docs. Internal code may keep upstream ids (`suite`, `discuss`, `indobase-suite` JWT `aud`, Docker service names, etc.).

**Never show in customer UI:** Gameplan, Frappe, Suite (upstream product), Drive, Writer, Sheets/Slides/Meet/Mail (upstream module names), Notifuse, Meteroid, Postiz, Penpot, or other fork/vendor names. AGPL attribution stays in repo `LICENSE` / `NOTICE` only.

---

## Core OS products

| Customer name | Internal handoff id | Host (prod) | Host (staging) | SSO |
|---|---|---|---|---|
| **Builder** | (separate `builder-launch.ts`) | `builder.indobase.in` | `builder.indobase.fun` | Studio handoff |
| **Backend Studio** | — (in-app) | `studio.indobase.in` | `studio.indobase.fun` | Studio session |
| **Workspace** | `suite` · `aud=indobase-suite` | `workspace.indobase.in` | `workspace.indobase.fun` | Studio SSO only |
| **Discuss** | `discuss` · `aud=indobase-discuss` | `discuss.indobase.in` | `discuss.indobase.fun` | Studio SSO only |
| **Payments** | `payments` | `payments.indobase.in` | `payments.indobase.fun` | Studio SSO only |
| **Analytics** | `analytics` | `analytics.indobase.in` | `analytics.indobase.fun` | Studio SSO only |
| **Design** | `design` | `design.indobase.in` | `design.indobase.fun` | Studio SSO only |
| **Email** | `email` | `email.indobase.in` | `email.indobase.fun` | Studio SSO only |
| **Social** | `social` | `social.indobase.in` | `social.indobase.fun` | Studio SSO only |
| **Video** | `video` | `video.indobase.in` | `video.indobase.fun` | Studio SSO only |

Studio source of truth for chooser copy: `apps/studio/lib/constants/ecosystem-products.ts`.

---

## Discuss

| Context | Use |
|---|---|
| Product tile / page title | **Discuss** |
| Descriptor / subtitle | **Team chat** (never the primary product title) |
| Tagline | Team chat for your org and project |
| Launch CTA | Open Discuss |
| Bridge / HTML title | Indobase Discuss |
| Frappe `app_icon_title` | Discuss |

Discuss owns async org/project chat. It does **not** include files, docs, or mail.

---

## Workspace

| Context | Use |
|---|---|
| Product tile / page title | **Workspace** |
| Do not use | “Suite”, “Frappe Suite”, “Indobase Suite” in customer UI |
| Tagline | Files, docs, sheets, meetings, calendar |
| Launch CTA | Open Workspace / Open Workspace home |
| Bridge / HTML title | Indobase Workspace |
| Frappe `app_icon_title` | Workspace |

### Workspace modules (customer-facing)

| Module | Notes |
|---|---|
| **Files** | Not “Drive” |
| **Docs** | Not “Writer” |
| **Sheets** | Same name (upstream-aligned) |
| **Presentations** | Not “Slides”; optional deep-link to **Design** when `NEXT_PUBLIC_WORKSPACE_SLIDES_VIA_DESIGN=true` |
| **Meetings** | Not “Meet” |
| **Mail** | Tile label only — SSO opens **Email**, not upstream Suite Mail |
| **Calendar** | Same name |

---

## Cross-product rules

1. **SSO only** — no separate email/password login surfaces for ecosystem apps; unauthenticated users redirect to Studio sign-in.
2. **Mail** — Workspace “Mail” module always handoffs to **Email** (`aud=indobase-email`).
3. **Presentations vs Design** — deck-first workflows stay in Workspace Presentations; visual marketing assets stay in **Design**.
4. **Discuss vs Workspace** — chat in Discuss; files/docs/meetings in Workspace. Studio copy must not blur the boundary.
5. **CTAs** — “Open Builder”, “Open Discuss”, “Open Workspace” (no “Indobase” prefix on buttons).

---

## Related docs

- [INDOBASE-DISCUSS.md](./INDOBASE-DISCUSS.md)
- [INDOBASE-SUITE.md](./INDOBASE-SUITE.md) (Workspace integration)
