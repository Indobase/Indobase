# Third-party attribution

Indobase Workspace is built on [Frappe Suite](https://github.com/frappe/suite) by Frappe Technologies Pvt Ltd, licensed under **AGPL-3.0**.

Upstream source is vendored at `vendor/suite/` (git submodule) or fetched during Docker init. See `license.txt` in that tree.

Customer-facing product name is **Indobase Workspace** (suite of Files, Docs, Sheets, Presentations, Meetings, Calendar). Do not expose "Frappe", "Suite", "Drive", "Writer", "Sheets", "Slides", "Meet", or competitor product names in user-visible UI, routes, OAuth client names, or email footers.

Mail in Workspace launches **Indobase Email** (Notifuse fork) — not upstream Suite Mail.

Presentations can open **Indobase Design** for visual canvas work; deck-focused editing uses upstream Slides when the Frappe stack is deployed.
