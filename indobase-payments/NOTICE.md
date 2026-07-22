# Notice — Indobase Payments (AGPL-3.0)

This software is a fork of [Meteroid](https://github.com/meteroid-oss/meteroid)
(Copyright Meteroid / meteroid-oss contributors), licensed under the
**GNU Affero General Public License v3.0** (see `LICENSE`).

## Product name

Customer-facing product name: **Indobase Payments**.

Internal crate, Docker service, and module names may still contain `meteroid`
identifiers for upstream compatibility. Renaming those is intentionally deferred;
it does not change the license.

## Source availability (AGPL §5(a) / network use)

If you modify and run this software as a network service, AGPL requires that
users interacting with it over a network can obtain the Corresponding Source of
your modified version.

Indobase publishes the Indobase Payments source **inside the Indobase monorepo**:

- **https://github.com/Indobase/Indobase/tree/main/indobase-payments**

There is **no** separate `Indobase/indobase-payments` GitHub repository.

Operators who deploy a modified copy must likewise offer Corresponding Source
to network users (for example via a “Source” link in the UI, or the public
monorepo path for that deployment).

This notice is informational and is **not legal advice**.

## Upstream attribution

- Upstream project: https://github.com/meteroid-oss/meteroid
- Upstream license: AGPL-3.0
- Fork base: Meteroid release tag `v1.0.0-rc6` (see `Cargo.lock` / image pins)
