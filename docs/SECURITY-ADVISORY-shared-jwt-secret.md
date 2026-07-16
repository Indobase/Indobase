# Security advisory — projects shared one JWT signing secret

**Status:** fix shipped for new projects; existing projects require rotation
**Severity:** Critical — cross-tenant read of auth users, database tables, and storage
**Component:** Studio control plane (`createProject`) + every tenant data plane

---

## Summary

Every project was created with `jwt_secret_enc = NULL` and therefore signed and verified JWTs with
the **shared platform secret** (`AUTH_JWT_SECRET` / `JWT_SECRET`) instead of a per-project secret.

Tenant GoTrue and PostgREST verify only the JWT **signature**. The `project_ref` claim carried in the
token is **not enforced by anything**. So any two projects that share a secret accept each other's
tokens: **project A's anon key is a valid credential on project B.**

This is not limited to the Free tier. Free is where it surfaces most easily (the shared gateway
routes on a client-supplied `x-project-ref` header), but isolated/paid tenants are equally affected —
a request to `https://<other-ref>.<domain>/rest/v1/...` carrying your own anon key is accepted.

## Impact

Any customer holding any project's anon or service key could read **other tenants'**:

- `auth.users` (accounts, emails, identities)
- application tables via PostgREST
- storage objects

A `service_role` key additionally grants write/admin access to other tenants. Because anon keys are
distributed in client apps by design, this is not a theoretical exposure.

## Root cause

`apps/studio/lib/api/saas/platform.ts` — `createProject()`:

```ts
const jwtSecret = resolveProjectJwtSecret(null)   // null => env fallback => the GLOBAL secret
const anonKey = makeProjectJwt(jwtSecret, 'anon', ref)
const serviceKey = makeProjectJwt(jwtSecret, 'service_role', ref)
```

`resolveProjectJwtSecret()` intentionally falls back to `resolveJwtSecretFromEnv()` when no
per-project secret is stored. `createProject` passed `null` unconditionally, and the project INSERT
never wrote `jwt_secret_enc`. `getTenantStackArtifacts()` then resolved the same NULL to the same env
secret and baked it into every tenant's compose as `PGRST_JWT_SECRET` / `GOTRUE_JWT_SECRET`.

Net effect: one signing key across the entire fleet.

## Why existing checks missed it

The token schemas matched, the HMAC/JWT code was correct, the handoff crypto was sound, and the data
plane correctly gives each project its own `tenantdb_<ref>`. **Per-project databases do not help when
the signing key is shared** — isolation was defeated at the auth layer, above the database.

## Fix

**1. New projects (shipped)**
- `generateProjectJwtSecret()` in `lib/api/saas/project-jwt.ts` — 48 random bytes, base64url.
- `createProject()` generates a per-project secret, signs that project's anon/service keys with it,
  and persists it to `jwt_secret_enc`, so the tenant stack provisions with the project's own secret.

**2. Existing projects (requires rotation)**
`POST /api/cron/backfill-project-jwt-secrets` — read-only by default. Reuses the existing
`updateProjectJwtSecret()` path: new secret → new anon/service keys → tenant stack reprovisioned.

> **Rotation is breaking by design.** It mints new anon/service keys. Apps using the old key stop
> working. This is unavoidable: the old keys *are* the cross-tenant credential. There is no fix that
> keeps them valid.

### Rejected alternatives

| Option | Why rejected |
|---|---|
| Enforce the `project_ref` claim at the gateway / `db-pre-request` hook | GoTrue-issued **user** tokens carry no `project_ref` claim — only anon/service keys do. The check would either reject every logged-in user or let foreign user tokens through. Looks fixed, isn't. |
| Dual-secret grace period (accept old + new) | Accepting the old global secret keeps the vulnerability open for the entire window. |

## Operator runbook

All commands need `Authorization: Bearer $INDOBASE_CRON_SECRET`.

**1. Assess blast radius (read-only):**
```bash
curl -sS -X POST 'https://studio.indobase.in/api/cron/backfill-project-jwt-secrets' \
  -H "Authorization: Bearer $INDOBASE_CRON_SECRET" | jq .
```
`projects_sharing_global_jwt_secret: 0` ⇒ no exposure; stop here and re-open the investigation.

**2. Rotate Free tier immediately** — prototypes, low blast radius, largest population:
```bash
curl -sS -X POST '.../api/cron/backfill-project-jwt-secrets?plan=free&apply=1&limit=200' \
  -H "Authorization: Bearer $INDOBASE_CRON_SECRET" | jq .
```

**3. Rotate paid projects one at a time, after notifying each owner:**
```bash
curl -sS -X POST '.../api/cron/backfill-project-jwt-secrets?project_ref=<ref>&apply=1' \
  -H "Authorization: Bearer $INDOBASE_CRON_SECRET" | jq .
```

**4. Rotate the platform secret last.** Once every project has its own secret, rotate
`AUTH_JWT_SECRET` / `JWT_SECRET` — anyone who ever held any project's anon key effectively holds the
old master key.

**5. Verify** the dry run returns `0`, and confirm two projects' anon keys no longer cross-validate.

## DPDP Act considerations (India)

A cross-tenant exposure of `auth.users` is a **personal data breach** under the DPDP Act, 2023.
Indobase acts as a Data Fiduciary for platform accounts and a Data Processor for tenant end-users.

Before launch, legal/compliance should determine:

- [ ] Whether notification to the **Data Protection Board** is required, and the timeline
- [ ] Whether affected **customers (Data Fiduciaries)** must be notified so they can notify *their*
      users — likely yes under processor obligations
- [ ] Whether access logs can evidence **actual** cross-tenant access vs. mere exposure (this
      materially changes notification duty)
- [ ] Grievance Officer (`grievance@indobase.in`) briefed for inbound queries

The consent audit table (`saas.data_principal_consents`) and published Grievance Officer already
exist — the missing piece is a breach-notification decision and record.

## Customer notice (template)

> **Subject: Action required — your Indobase API keys have been rotated**
>
> We identified and fixed an issue where projects could share a signing key, which could have allowed
> one project's API key to access another project's data. We have rotated your project's keys.
>
> **What you must do:** copy your new `anon` key from **Studio → Project → Settings → API** and update
> your application. Your previous key no longer works.
>
> **What we did:** every project now has its own signing secret, generated at creation. New projects
> are unaffected.
>
> **Was my data accessed?** [Complete from access-log review before sending — do not speculate.]
>
> Questions: grievance@indobase.in

## Prevention

- [ ] Never let `resolveProjectJwtSecret()` fall back to the env secret for tenant provisioning —
      once all projects are backfilled, make the fallback throw instead of returning a shared key.
- [ ] Add a test asserting two freshly-created projects have **different** `jwt_secret_enc` and that
      one's anon key fails verification against the other's secret.
- [ ] Consider enforcing `project_ref`/`aud` per tenant as defense-in-depth, so a future shared-secret
      regression cannot become a cross-tenant read.
