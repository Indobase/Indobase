# Indobase OS — customer-facing naming dictionary

Canonical names for Studio, chooser tiles, launchers, bridge shells, and product docs. Internal code may keep upstream ids (`suite`, `discuss`, `indobase-suite` JWT `aud`, Docker service names, etc.).

**Never show in customer UI:** Mattermost, Gameplan, Frappe, Suite (upstream product), Drive, Writer, ONLYOFFICE, DocumentServer, Sheets/Slides/Meet/Mail (upstream module names), Notifuse, Meteroid, Postiz, Penpot, or other fork/vendor names. AGPL attribution stays in repo `LICENSE` / `NOTICE` only.

---

## Core OS products

| Customer name | Internal handoff id | Host (prod) | Host (staging) | SSO |
|---|---|---|---|---|
| **Builder** | (separate `builder-launch.ts`) | `builder.indobase.in` | `builder.indobase.fun` | Studio handoff |
| **Backend Studio** | — (in-app) | `studio.indobase.in` | `studio.indobase.fun` | Studio session |
| **Workspace** | `suite` · `aud=indobase-suite` | `workspace.indobase.in` | `workspace.indobase.fun` | Studio SSO only |
| **Discuss** | `discuss` · `aud=indobase-discuss` | `discuss.indobase.in` | `discuss.indobase.fun` | Studio SSO only |
| **Meet** | `meet` · `aud=indobase-meet` | `meet.indobase.in` | `meet.indobase.fun` | Studio SSO only |
| **Calendar** | `calendar` · `aud=indobase-calendar` | `calendar.indobase.in` | `calendar.indobase.fun` | Studio SSO only |
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
| Upstream SiteName (config) | Indobase Discuss |

Discuss owns async org/project chat (Mattermost-backed). It does **not** include files, docs, or mail.

---

## Workspace

| Context | Use |
|---|---|
| Product tile / page title | **Workspace** |
| Do not use | “Suite”, “Frappe Suite”, “Indobase Suite”, “ONLYOFFICE” in customer UI |
| Tagline | Files, docs, sheets, presentations |
| Launch CTA | Open Workspace / Open Workspace home |
| Bridge / HTML title | Indobase Workspace |
| Upstream engine | Document editor (AGPL) — never named in UI |

### Workspace modules (customer-facing)

| Module | Notes |
|---|---|
| **Files** | Not “Drive” |
| **Docs** | Not “Writer” |
| **Sheets** | Same name (upstream-aligned) |
| **Presentations** | Not “Slides”; optional deep-link to **Design** when `NEXT_PUBLIC_WORKSPACE_SLIDES_VIA_DESIGN=true` |
| **Meetings** | Module label in Workspace — **opens Indobase Meet** (SSO); never name the video engine |
| **Mail** | Tile label only — SSO opens **Email** |
| **Calendar** | Module label in Workspace — **opens Indobase Calendar** (SSO); never “Cal.com”, “cal.diy”, or “Cal” |

---

## Meet

| Context | Use |
|---|---|
| Product tile / page title | **Meet** |
| Bridge / HTML title | Indobase Meet |
| Tagline | Video meetings for your org and project |
| Launch CTA | Open Meet |
| Never in UI | Jitsi, Jitsi Meet, 8x8, “Powered by …” |
| Host | `meet.indobase.in` / `.fun` |
| Handoff | `meet` · `aud=indobase-meet` |

Meet owns realtime video for org/project. Workspace **Meetings** deep-links into Meet; Discuss remains async chat.

---

## Calendar

| Context | Use |
|---|---|
| Product tile / page title | **Calendar** |
| Bridge / HTML title | Indobase Calendar |
| Tagline | Events, availability, and scheduling |
| Launch CTA | Open Calendar |
| Paths | `/events`, `/team`, `/settings` |
| Never in UI | Cal.com, cal.diy, Cal, Calendly |
| Host | `calendar.indobase.in` / `.fun` |
| Handoff | `calendar` · `aud=indobase-calendar` |

Calendar owns scheduling and availability. Meet owns live video. Workspace **Calendar** SSO-launches Calendar.

---

## Cross-product rules

1. **SSO only** — no separate email/password login surfaces for ecosystem apps; unauthenticated users redirect to Studio sign-in.
2. **Mail** — Workspace “Mail” module always handoffs to **Email** (`aud=indobase-email`).
3. **Presentations vs Design** — deck-first workflows stay in Workspace Presentations; visual marketing assets stay in **Design**.
4. **Discuss vs Workspace vs Meet vs Calendar** — chat in Discuss; files/docs in Workspace; video in Meet; scheduling in Calendar. Workspace Meetings/Calendar modules launch Meet/Calendar.
5. **CTAs** — “Open Builder”, “Open Discuss”, “Open Meet”, “Open Calendar”, “Open Workspace” (no “Indobase” prefix on buttons).

---

## Related docs

- [INDOBASE-DISCUSS.md](./INDOBASE-DISCUSS.md)
- [INDOBASE-MEET.md](./INDOBASE-MEET.md)
- [INDOBASE-CALENDAR.md](./INDOBASE-CALENDAR.md)
- [INDOBASE-SUITE.md](./INDOBASE-SUITE.md) (Workspace integration)
