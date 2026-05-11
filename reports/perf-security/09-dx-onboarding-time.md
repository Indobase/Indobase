# 09) Developer Onboarding Time (DX Benchmark)

Generated: 2026-05-06

## Goal
Measure “time to first success” for a new developer:
- sign up / sign in
- create org + project
- obtain keys and endpoints
- run first REST query
- run first auth flow
- deploy first function

## What exists in this codebase
### Present
- Studio UI for org/project management and endpoints display
  - `apps/studio/components/ui/ProjectSettings/DisplayApiSettings.tsx` (project endpoints panel)
- Provisioning pipeline (MVP) creates tenant DB and stores encrypted DSN:
  - `apps/studio/lib/api/saas/platform.ts` + `provision-tenant-db.ts`

### Gaps impacting DX
- Tenant DB bootstrap is missing; new projects may not be immediately usable without manual steps.
- Data-plane provisioning may require an explicit “provision data-plane” action.

## Benchmark procedure
Record timestamps for:
1) Open `studio.indobase.in` (first page interactive)
2) Create account + verify email (if enabled)
3) Create org
4) Create project
5) Wait until status is healthy and endpoints are shown
6) Copy anon key + REST URL
7) Run a first query against `/rest/v1/`
8) Enable auth provider and sign in from a sample app
9) Deploy a function and invoke it

## Output metrics
- Total time (minutes)
- # of manual steps
- # of places user must switch context (Dokploy → Studio → DNS → etc.)

## Findings (current state)
DX is close to Supabase Studio UX in many places, but true “Cloud onboarding” parity requires:
- automatic tenant bootstrap
- automatic tenant stack provisioning and routing
- clear error messages when provisioning isn’t complete

