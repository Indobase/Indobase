# Indo Payments — architecture and decision record

Status: **planning**. Nothing is implemented yet. This document exists to pin down the three
constraints that decide the design before code is written, because each one is expensive to
discover late.

Indo Payments is the fourth product tile on the project landing page (currently "Coming soon",
alongside Analytics). The intent: a business built on Indobase can take payments from *its own*
customers — subscriptions, invoices, usage-based charges — without leaving the project.

---

## 1. The regulatory constraint decides the data model

Indo Payments collects money from an Indobase customer's end users and settles it to that customer.
In India, doing that as a principal is **Payment Aggregator (PA) activity and requires RBI
authorisation**. Building it the obvious way — one Razorpay account owned by Indobase, funds landing
in Indobase's bank account, Indobase paying out to customers — makes Indobase an unlicensed PA.

The standard way to avoid needing a PA licence is to build on a licensed aggregator's
platform/marketplace product (Razorpay Route, Cashfree Easy Split, and equivalents):

- Every Indobase customer is onboarded as a **sub-merchant in their own name**, with their own KYC
  and their own settlement bank account.
- Funds settle **directly to the sub-merchant**. Indobase orchestrates and never takes custody.
- Indobase's own commission, if any, is taken as a platform fee through the aggregator's split
  mechanism, not by receiving and re-paying the money.

**This is not legal advice.** It has to be confirmed with counsel and with the aggregator's
partnerships team before implementation. It is recorded here because it dictates the schema: there
is no "Indobase balance" table, and every payment object is owned by a sub-merchant, not by us.

**Open question blocking implementation:** which aggregator product, and are we a reseller or a
technology partner? Until that is answered the onboarding flow, the KYC fields, the webhook shapes,
and the settlement model are all unknown.

---

## 2. Meteroid's role — and what it is not

[Meteroid](https://github.com/meteroid-oss/meteroid) is pricing and billing infrastructure: usage
metering, subscription lifecycle, plans and tiers, invoicing, credit notes, quotes, customer portal.

It is **not** a payment aggregator and does not remove anything in section 1. It sits *above* the
aggregator: Meteroid decides *what to charge*, the aggregator *moves the money*.

Two facts about the project, verified against the repository rather than the marketing page:

| | |
|---|---|
| Licence | **AGPL-3.0** (confirmed against `LICENSE`; GitHub's detector agrees — plain AGPL, no Commons Clause) |
| Maturity | **Experimental**, `v1.0.0-rc6` — the README carries an explicit experimental badge |
| Payment adapters | **Stripe only.** `modules/meteroid/src/adapters` contains `stripe.rs` and nothing else — no Razorpay, no UPI |

The third row is the important one: an INR product needs a Razorpay adapter that does not exist, so
using Meteroid means writing Rust inside Meteroid.

---

## 3. The AGPL boundary

AGPL-3.0 §13 obliges anyone who **modifies** the software and offers it over a network to make the
modified source available to the users of that service. Adding a Razorpay adapter is a modification.

The agreed position is **fork and publish the fork**. To keep that obligation bounded, the boundary
must be strict:

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Indobase Studio (private)  │  API   │  Meteroid fork (AGPL-3.0,    │
│  - onboarding, KYC state    │ ─────► │  published)                  │
│  - sub-merchant records     │        │  - stock Meteroid            │
│  - product UI               │        │  - + razorpay.rs adapter     │
└─────────────────────────────┘        └──────────────────────────────┘
        stays proprietary                  everything here is public
```

Rules that keep the boundary real:

1. **Indobase code never links Meteroid code.** Communication is over Meteroid's API only. No vendored
   crates, no copied source into `apps/` or `packages/`.
2. **Everything inside the fork is published**, including the Razorpay adapter. Assume any business
   logic placed there becomes public — so keep pricing strategy, fraud rules, and customer data
   handling on the Indobase side.
3. The fork lives in its **own repository**, not in this monorepo. Vendoring AGPL source into a
   repository that also contains proprietary code invites exactly the derivative-work argument the
   boundary is meant to avoid.

---

## 4. Infrastructure footprint

Meteroid's own `docker/deploy/docker-compose.yml` defines **10 services**:

| Service | Image |
|---|---|
| `meteroid-db` | `ghcr.io/meteroid-oss/meteroid-postgres:18.3-standard` |
| `clickhouse` (+ `clickhouse-volume-init`) | `clickhouse/clickhouse-server:25.6.2-alpine` |
| `redpanda` (+ `redpanda-topic-create`) | `docker.redpanda.com/redpandadata/redpanda:v23.3.1` |
| `meteroid-api` | `ghcr.io/meteroid-oss/meteroid-api:latest` |
| `meteroid-scheduler` | `ghcr.io/meteroid-oss/meteroid-scheduler:latest` |
| `metering-api` | `ghcr.io/meteroid-oss/metering-api:latest` |
| `meteroid-web` | `ghcr.io/meteroid-oss/meteroid-web:latest` |

**This cannot share the current platform VPS.** That box is 4 vCPU / 16 GB and already carries the
tenant data plane sized for ~1000 free-tier projects. ClickHouse and Redpanda are each multi-GB
resident under load; adding both plus four Rust services would contend with tenant Postgres for RAM
and evict tenant page cache. Indo Payments needs its **own host**, and the tenant-facing services
must not be co-tenanted with it.

The `:latest` tags above are also unacceptable for a payments system — pin digests before any
deployment.

---

## 5. What is NOT affected

The existing Razorpay integration (`apps/studio/lib/api/saas/razorpay-billing.ts` and friends) bills
**Indobase's own** customers for their Indobase plan — `applyOrganizationPlan`,
`downgradeOrganizationToFree`, plan webhooks. That is platform billing and is unrelated to Indo
Payments. Nothing in this document changes it, and Indo Payments must not be built by extending it:
the two have different owners of the money and different regulatory footing.

---

## 6. Sequencing

Implementation is blocked on section 1. Ordered so the expensive, hard-to-reverse work happens after
the unknowns are closed:

1. **Settle the aggregator relationship** (legal + Razorpay/Cashfree partnerships). Blocking.
2. Fork Meteroid to its own public repository. Pin to a release tag, not `main`.
3. Stand up stock Meteroid on a dedicated host, digest-pinned, and evaluate it against a real
   pricing scenario **before** writing any Rust. It may turn out that the metering engine is more
   than phase 1 needs, in which case the cheapest correct answer is not to adopt it yet.
4. Write the Razorpay adapter in the fork. Publish.
5. Build the Indobase-side integration: sub-merchant onboarding, KYC state, project-scoped API keys.
6. Product UI, replacing the "Coming soon" tile.

Steps 3 and 4 are the ones worth re-deciding once step 1 is answered — an aggregator that already
provides subscription and invoicing primitives may make Meteroid redundant for phase 1.
