# Third-party attribution

Indobase Discuss is built on [Gameplan](https://github.com/frappe/gameplan) by Frappe Technologies Pvt Ltd, licensed under **AGPL-3.0**.

Upstream source is fetched during Docker init (`bench get-app gameplan`) or optionally vendored at `vendor/gameplan/`. See upstream `LICENSE`.

Customer-facing product name is **Indobase Discuss**. Do not expose "Gameplan", "Frappe", or "Mattermost" in user-visible UI, routes, OAuth client names, or email footers.

Network users can reach `/notices` on the Discuss host for a short attribution pointer.
