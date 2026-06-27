# Indobase — Fixes (customer-readiness pass)

_Compiled 2026-06-27. Code fixes from the VAT/UAT + live customer-flow review. Each item lists
repo, branch, commit, files, and how it was verified. A broader status (what was checked vs
remaining) lives in `CUSTOMER_READINESS_STATUS.md` at the monorepo root._

---

## Studio (`Indobase/`)

### 1. React `rules-of-hooks` crashes (10) — **this branch**
**Branch:** `fixes/studio-rules-of-hooks` · **Files:** `apps/studio/components/layouts/LogsLayout/LogsSidebarMenuV2.tsx`, `apps/studio/pages/org/[slug]/billing.tsx`

Two components called hooks **after an early return**, violating the rules of hooks and risking
"rendered more/fewer hooks than previous render" runtime crashes:
- `billing.tsx` — `useEffect` ran after the `!IS_SAAS` early return → hoisted all hooks above the early returns.
- `LogsSidebarMenuV2.tsx` — 8 hooks ran after an early `!ref` return → moved the guard below all hooks and gated the ETL sources query on `Boolean(ref)` (`useContentQuery` already self-disables when `projectRef` is undefined).

**Verified:** `eslint` → 0 `react-hooks/rules-of-hooks` errors in both files; no new errors.

### 2. SaaS bootstrap deadlock — **already fixed upstream** (not in this branch)
The dashboard hung after login with `PgMetaDatabaseError: deadlock detected (40P01)` on
`/profile`, `/organizations`, `/projects`, because `ensureSaasTablesOnce()` re-ran the full schema
bootstrap (DDL + GRANT storm) on every cold start and the cached promise reset on error (retry storm).
**`main` already fixes this** in commit `9d6e1a56` ("Fix Studio builder deadlocks…", same fast-path
idea — skip bootstrap when already provisioned), so no studio change is needed here. An equivalent
fix was also prototyped on branch `fix/studio-customer-readiness` (commit `9f81b9de`) but is redundant
with `main`.

---

## Builder (`builder/`)

**Branch:** `security/vat-uat-remediation`

### 3. Server LLM key leak (CRITICAL) — commit `e8409b5`
**File:** `app/routes/api.export-api-keys.ts`

The endpoint merged **server/env provider keys** (incl. the shared `OPEN_ROUTER_API_KEY`) into an
**unauthenticated** JSON response, leaking them to any caller. Now returns **only the caller's own
cookie-provided keys**; never reads `process.env` / the Cloudflare env binding. Adds `no-store` + `nosniff`.

> ⚠️ The already-exposed OpenRouter key must still be **rotated** in production (revoke in OpenRouter →
> set new `OPEN_ROUTER_API_KEY` in the Cloudflare Pages `bolt` project → redeploy).

### 4. Open SSRF git-proxy (CRITICAL) — commit `e8409b5`
**File:** `app/routes/api.git-proxy.$.ts`

Was an open proxy that fetched any host and forwarded the `Authorization` header. Now default-denies
to an allowlist of public git hosts (github/gitlab/bitbucket/codeberg/sr.ht/gitea/azure), rejects IP
literals, ports, userinfo and non-hostname input (blocks `localhost`, private ranges,
`169.254.169.254` metadata), and stops logging forwarded request/response headers (which included `Authorization`).

### 5. "Run command" hangs forever — commit `73cef8c`
**File:** `app/utils/shell.ts`

`BoltShell.waitTillOscCode()` looped on the terminal output stream with **no timeout**, so it blocked
forever whenever an expected OSC marker never arrived:
- the `prompt` marker after `Ctrl+C` → the command was never written to the shell (the "Run command"
  step spins with an **empty terminal**), and
- the `exit` marker for a non-terminating command (e.g. a dev server) → the step spins forever even
  though the process is fine.

Added a hard deadline to `waitTillOscCode` (races each stream read against the remaining budget and
returns `{ timedOut: true }` instead of looping), a **10s** timeout on the prompt wait (so the command
is still sent if the marker stalls), and a **600s** backstop on the exit wait. The WebContainer process
keeps running; we just stop blocking the UI on an OSC code that may never come.

**Verified:** typechecks clean; builder boots in a real cross-origin-isolated browser
(`crossOriginIsolated` + `SharedArrayBuffer` = true) with 0 page errors. Full live verification needs
a deploy to the Cloudflare `bolt` project (direct API access is now `401` without the Studio handoff).

---

## Deploy / follow-up
- **Builder fix (#5)** and the security fixes (#3, #4) need a deploy to **Cloudflare Pages `bolt`**.
- **Rotate the OpenRouter key** (see #3).
- Studio deadlock (#2) is already on `main` — deploy `main` to the Dokploy box for prod relief.
