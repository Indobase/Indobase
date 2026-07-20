# PostHog error tracking (Indobase)

SDK-based error tracking is enabled across Studio, the marketing site (`apps/www`), and Builder. Unhandled browser errors are autocaptured after PostHog initializes; caught user-visible failures use `captureException`.

## Dashboard setup (required)

1. In PostHog → **Error tracking** → **Configuration**, enable exception capture.
2. Create a **Personal API key** with **Error tracking write** (and **Organization read** for CLI uploads).
3. Note your **Project ID** (Project settings).

## Client SDK behavior

| App | Init location | Consent |
|-----|---------------|---------|
| Studio | `packages/common/posthog-client.ts` via `PageTelemetry` | Respects `hasConsented()` |
| www | `apps/www/src/lib/analytics/posthog.ts` | Prod only (no key → no init) |
| Builder | `indobase-builder/app/lib/analytics/posthog.client.ts` | Prod only (no key → no init) |

Autocapture config (all apps): unhandled errors + unhandled promise rejections; `console.error` is **not** autocaptured.

Manual capture helpers:

- Studio client: `posthogClient.captureException(error, props, hasConsent)`
- Studio server: `capturePostHogException(distinctId, error, props)` in `apps/studio/lib/posthog-server.ts`
- www: `capturePostHogException(error, props)`
- Builder: `capturePostHogException(error, props)`

## Environment variables

### Analytics (project token — safe in client bundles)

| Variable | App | Description |
|----------|-----|-------------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Studio | Project API key (`phc_…`) |
| `NEXT_PUBLIC_POSTHOG_HOST` | Studio | Ingest host (default `https://us.i.posthog.com`) |
| `NEXT_PUBLIC_POSTHOG_UI_HOST` | Studio | App UI host (default `https://us.posthog.com`) |
| `PUBLIC_POSTHOG_API_KEY` | www | Project API key |
| `PUBLIC_POSTHOG_HOST` | www | Ingest host |
| `PUBLIC_POSTHOG_UI_HOST` | www | App UI host |
| `VITE_POSTHOG_KEY` | Builder | Project API key |
| `VITE_POSTHOG_HOST` | Builder | Ingest host |
| `VITE_POSTHOG_UI_HOST` | Builder | App UI host |

### Source maps (CI / build only — never commit)

| Variable | Description |
|----------|-------------|
| `POSTHOG_CLI_API_KEY` | Personal API key with error-tracking write |
| `POSTHOG_CLI_PROJECT_ID` | Numeric project ID |
| `POSTHOG_CLI_HOST` | PostHog app host (default `https://us.posthog.com`; EU: `https://eu.posthog.com`) |

Studio may also use `POSTHOG_API_KEY` + `POSTHOG_PROJECT_ID` if you adopt `@posthog/nextjs-config` (see below).

## Source maps

Production builds emit **hidden** source maps for Vite apps (www, Builder). Studio already generates webpack source maps via `@sentry/nextjs` during `next build`.

### Upload with PostHog CLI (www + Builder)

Install once in CI or locally:

```bash
npm install -g @posthog/cli
```

After `pnpm build`, from the app directory:

```bash
# Marketing site
cd apps/www
posthog-cli sourcemap inject --directory build
posthog-cli sourcemap upload --directory build

# Builder
cd indobase-builder
posthog-cli sourcemap inject --directory build/client
posthog-cli sourcemap upload --directory build/client
```

Or use the repo helper (requires env vars above):

```bash
./scripts/posthog-upload-sourcemaps.sh www
./scripts/posthog-upload-sourcemaps.sh builder
```

Serve the **injected** assets in production. Upload maps before or with each deploy so stack traces resolve.

### Studio (Next.js)

Studio uses Sentry for source maps today. For PostHog symbolication you can either:

1. **Also upload Studio maps to PostHog** after build:
   ```bash
   posthog-cli sourcemap inject --directory apps/studio/.next
   posthog-cli sourcemap upload --directory apps/studio/.next
   ```
2. **Or** add `@posthog/nextjs-config` and wrap `next.config.js` with `withPostHogConfig` (set `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `NEXT_PUBLIC_POSTHOG_HOST` in Docker/CI). This can run alongside Sentry if upload steps are coordinated.

## CI notes

- `docker-publish.yml` already passes `POSTHOG_PROJECT_KEY` → `NEXT_PUBLIC_POSTHOG_KEY` for Studio images.
- Add GitHub secrets `POSTHOG_CLI_API_KEY` and `POSTHOG_CLI_PROJECT_ID` when you wire CLI upload into CI.
- Prefer uploading from the same commit SHA that is deployed (`VERCEL_GIT_COMMIT_SHA` / image tag).
