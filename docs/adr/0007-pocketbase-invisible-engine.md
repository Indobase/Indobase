# ADR 0007: PocketBase is the invisible business-data engine

**Status:** Accepted  
**Date:** 2026-08-13

Canonical: [../INDOBASE-OS.md](../INDOBASE-OS.md) · [0006-capability-orchestrator.md](./0006-capability-orchestrator.md)

---

## Context

Indobase OS (CFOS + agent) already launches and operates businesses. PocketBase is the live business-data engine (auth, collections, files, API, realtime). Studio / `saas.*` / dedicated tenant stacks are the previous control plane.

Two failure modes to avoid:

1. Treating Studio as a customer product or a required hop on Launch / Operate.
2. Recreating the old heavy provisioner as **one PocketBase + Docker + network per business**.

## Decision

1. **Indobase is the operating system.** CFOS is the execution runtime. The agent is the operator. PocketBase is an implementation detail, not an integration the customer connects.
2. **Studio is obsolete on the product path.** Remove it from the customer journey and from new critical runtime. Do **not** delete Studio-era code until each remaining dependency (OTP identity, billing, prompt meter, Platform API host) has a proven OS replacement.
3. **Default data model is shared infrastructure**, scoped by workspace / business id:

```text
Shared PocketBase
        │
 workspace / business_id
        │
 Users · Products · Orders · Business data
```

Isolate (dedicated instance / network) only when scale or security requires it. Do not build a PocketBase provisioner that mints a container per business by default.

4. **Capability ensure is invisible.** `ensure(auth)` → PocketBase auth → configure app → test login → “Customer login is enabled.” Never “PocketBase connection established.”
5. **Launch is** `business.launch` → `execution.publish` → Indobase Launch Engine → live host + DNS/HTTPS. Never Studio publish, Coolify, or tenant provisioner as the customer path.
6. **Customer language** (binding):

| Internal | Customer sees |
|----------|----------------|
| PocketBase created | Business data enabled |
| PocketBase auth | Customer login enabled |
| Collection created | Products / customers / orders ready |
| Deployment job | Launching |
| Static host | Live |
| Capability ensurer | Automatic setup |
| Studio / saas.* / tenant / project / provisioner | (never said) |

## Consequences

- Agent turns must speak from Authoritative state + BusinessSnapshot (same truth as Control Center).
- New work must not add Studio destinations, “Open Studio”, or PocketBase/tenant/provisioner copy.
- Plan id `studio` may remain a billing enum until renamed; operator chrome says **Team**, not Studio.
- Five frozen agent tools stay frozen. This ADR does not add tools.
