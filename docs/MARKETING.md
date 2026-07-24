# Indobase Marketing — hub launcher

Status: **Studio UX scaffold** (chooser + hub). Product engines are not forked or
deployed yet.

**Indobase Marketing** is a first-party **hub**, not one combined frankenstein app.
From the project chooser, customers open Marketing and pick a tool:

| Tile | Planned engine | License | Sequence |
|---|---|---|---|
| Email marketing | [Notifuse](https://github.com/Notifuse/notifuse) fork | AGPL-3.0 | **First** — Studio SSO next |
| Social media posting | [Postiz](https://github.com/gitroomhq/postiz-app) fork | AGPL-3.0 | After Email |
| Visual designer | [Penpot](https://github.com/penpot/penpot) fork | MPL-2.0 | Later |
| Video editor | [OpenCut](https://github.com/OpenCut-app/OpenCut) fork | MIT | Later |

Brand surfaces always say **Indobase Marketing** (and per-tool names such as
Indobase Email) — never upstream product names in customer-facing UI.

---

## Studio surface (shipped)

| Piece | Location |
|---|---|
| Chooser tile | `ProjectExperienceChooser` → `/project/[ref]/marketing` |
| Hub page | `/project/[ref]/marketing` — four Coming soon tiles; Email elevated as first up |
| Layout | Ungated like Payments (no Backend Studio sidebar / plan gate) |

No third-party iframes. No fake launch URLs in production until SSO + staging
hosts exist.

---

## Auth model (planned)

Same pattern as Indobase Payments:

- Operators use existing Studio sign-up / sign-in.
- Studio mints a short-lived handoff JWT; each engine verifies and creates a session.
- No second password per marketing tool.

**Next engineering step (Email / Notifuse):** fork Notifuse under Indobase branding,
deploy staging host, add `INDOBASE_EMAIL_URL` (or similar) + Studio launch route
mirroring `/api/platform/projects/[ref]/payments/launch`.

---

## License / compliance notes

- **AGPL (Notifuse, Postiz):** keep forks in clearly bounded packages/services;
  offer corresponding source for network use; do not mix AGPL into proprietary
  Studio/Builder bundles without a deliberate boundary (same approach as
  `indobase-payments/`).
- **MPL (Penpot):** file-level copyleft — track modified files.
- **MIT (OpenCut):** permissive; still attribute upstream.

India DPDP applies to audience/contact data stored by Email and Social engines.

---

## Out of scope for this scaffold

- Full Notifuse / Postiz / Penpot / OpenCut forks and VPS deploy
- Razorpay / Payments changes
- Production promotion until staging smoke on `studio.indobase.fun` is OK
