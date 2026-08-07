# Indobase OS — Gen 3 (CFOS-native)

Agentic Business OS: one Indobase shell. Engines sit behind Capabilities — not front doors. See [`docs/INDOBASE-OS.md`](../docs/INDOBASE-OS.md) and [`docs/PLATFORM.md`](../docs/PLATFORM.md).

## Day-one entry

1. **`/`** — simple Indobase OS landing (Start building). Authenticated sessions get the core agent shell (top bar + CFOS iframe).
2. **`/start`** — email OTP → OS workspace (**no** data-plane provision at signup).
3. **Legacy** — `/sso/launch#token=…` for existing accounts only.

## Platform API (headless control plane)

Bridge calls **`PLATFORM_API_URL`** (Studio service hosting `/api/os/v1/*`):

| Route | Purpose |
|-------|---------|
| `POST /api/os/v1/identity/otp/start` | Send verification code |
| `POST /api/os/v1/identity/otp/verify` | Verify + create OS workspace |
| `POST /api/os/v1/runtime/ensure` | Lazy Ensurer (`capability.ensure`) |
| `POST /api/os/v1/deploy/publish` | Go Live wire path (`business.launch` → `execution.publish`; rename later) |

Header: `X-Indobase-OS-Secret` (= `BUILDER_CFOS_HANDOFF_SECRET`).

Bridge proxies: `POST /api/os/runtime/ensure`, `POST /api/os/deploy/publish`.

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
