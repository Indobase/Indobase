# Indobase OS — Gen 3 (CFOS-native)

Agentic Business OS: one Indobase shell. Engines sit behind Capabilities — not front doors. See [`docs/INDOBASE-OS.md`](../docs/INDOBASE-OS.md) and [`docs/PLATFORM.md`](../docs/PLATFORM.md).

## Day-one entry

1. **`/`** — mints a guest session and opens the agent workspace as the **direct CFOS document** (no outer iframe chrome). Guest is account-first: the agent must complete account in chat via `/auth/start` + `/auth/verify` (DPDP consent; no signup popup) before docs/design/code/launch/enable.
2. **`/start`** — redirects to `/` (legacy marketing links).
3. **Legacy** — `/sso/launch#token=…` for existing accounts only.

Finish remaining product gaps (see [BUILDER-GEN3-STATUS.md](../docs/BUILDER-GEN3-STATUS.md)) on **`staging`** before any Vyom / production roll.

## Platform API (headless control plane)

Bridge calls **`PLATFORM_API_URL`** (Studio service hosting `/api/os/v1/*`):

| Route | Purpose |
|-------|---------|
| `POST /api/os/v1/identity/otp/start` | Send verification code |
| `POST /api/os/v1/identity/otp/verify` | Verify + create OS workspace |
| `POST /api/os/v1/runtime/ensure` | Lazy Ensurer (`capability.ensure`); rejects guest/`draft_*` + Free without `backendStudio` |
| `POST /api/os/v1/deploy/publish` | Go Live wire path (`business.launch` → `execution.publish`; rename later) |
| `GET`/`POST /api/os/v1/usage/prompt-quota` | Check / consume Free agent prompts (shared Builder meter) |

Header: `X-Indobase-OS-Secret` (= `BUILDER_CFOS_HANDOFF_SECRET`).

Bridge proxies: `POST /api/os/runtime/ensure`, `POST /api/os/deploy/publish`, `GET`/`POST /api/os/usage/prompt-quota`. Guests may read `/api/os/launch/status`; mutate paths return `403 account_required`.

CI builds Hub image `roshanraghavander/indobase-builder-cfos:<git-sha>` via `.github/workflows/docker-publish.yml` (push to `staging`/`main`).

## Env

| Env | Value |
|-----|--------|
| `BUILDER_CFOS_HANDOFF_SECRET` | ≥32 chars; shared with Platform API |
| `PLATFORM_API_URL` | Control plane base, e.g. `http://127.0.0.1:8080` |
| `CLOUDFLARE_OS_URL` | Agent runtime (dev-stack sets this) |

## Quick start

```bash
cd packages/cloudflare-adapter && pnpm install --ignore-workspace && pnpm test
cd ../platform-api && pnpm install --ignore-workspace && pnpm test
cd ../../indobase-builder-cfos/bridge
pnpm install --ignore-workspace
export BUILDER_CFOS_HANDOFF_SECRET="$(openssl rand -hex 24)"
export PLATFORM_API_URL=http://127.0.0.1:8080   # Studio with /api/os/v1 routes
pnpm dev
pnpm test
```

Integrated stack: `./scripts/dev-stack.sh`

## Paths

| Path | Purpose |
|------|---------|
| `/os/app/*` | Agent execution runtime |
| `/api/indobase/proxy/*` | Tenant API (after lazy Ensurer) |
| `/api/session` | Workspace + generation context |

## Legacy Studio handoff

| Env | Value |
|-----|--------|
| `BUILDER_USE_CFOS` | `1` |
| `BUILDER_CFOS_APP_URL` | Bridge URL |

See [`docs/BUILDER-GEN3-STATUS.md`](../docs/BUILDER-GEN3-STATUS.md).
