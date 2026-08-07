# Indobase Builder Gen 3 PoC — agent runtime bridge
#
# Studio SSO → this bridge → (optional) agent execution runtime (CF OS, internal).
# Does NOT replace classic Builder publish yet. See docs/BUILDER-GEN3.md.

## Ownership

**Indobase owns** identity, projects, workspace, commands, events, capabilities, billing, deploy, snapshots, AI orchestration.  
**Agent execution runtime** (CF OS) is an implementation detail behind `@indobase/cloudflare-adapter`. It must never write durable project state.

Customer-facing UI and agent hints use Indobase naming only.

## What this PoC proves

1. Studio can launch a Builder Gen 3 runtime with a signed handoff JWT.
2. Bridge verifies `aud=indobase-builder-cfos` and links the Indobase project + backend env.
3. Session → Generation Context mapping goes through `@indobase/cloudflare-adapter`.
4. Optional embed of the agent execution runtime as `/os/app/*` (session-gated reverse proxy).

**Out of scope today:** one-click publish to `{ref}.indobase.in`, custom domains, prompt quotas, full Chat→Commands migration.

## Quick start (bridge only — 2 minutes)

```bash
cd packages/cloudflare-adapter && pnpm install --ignore-workspace && pnpm test
cd ../../indobase-builder-cfos/bridge
pnpm install --ignore-workspace   # keep this package out of the monorepo install
export BUILDER_CFOS_HANDOFF_SECRET="$(openssl rand -hex 24)"   # >= 32 chars
pnpm dev   # http://127.0.0.1:8791
pnpm test
```

Mint a local SSO link (no Studio):

```bash
chmod +x ../scripts/mint-local-handoff.sh
BUILDER_CFOS_HANDOFF_SECRET="$BUILDER_CFOS_HANDOFF_SECRET" ../scripts/mint-local-handoff.sh
# open the printed URL
```

Health: `curl -s http://127.0.0.1:8791/sso/health`

## Wire Studio (local or staging)

Set on Studio:

| Env | Value |
|-----|--------|
| `BUILDER_USE_CFOS` | `1` |
| `BUILDER_CFOS_APP_URL` | `http://127.0.0.1:8791` (or your bridge URL) |
| `BUILDER_CFOS_HANDOFF_SECRET` | same secret as the bridge (or reuse `BUILDER_HANDOFF_SECRET`) |

Existing **Open Builder** buttons call `/api/platform/projects/:ref/builder/launch`. With `BUILDER_USE_CFOS=1` they mint a CFOS handoff instead of classic Builder.

Force one request without flipping the global flag:

`GET /api/platform/projects/:ref/builder/launch?runtime=cfos`

## Integrated agent runtime (recommended)

One command starts the local execution runtime + Indobase bridge (session-gated reverse proxy at `/os/app/`):

```bash
chmod +x scripts/dev-stack.sh
./scripts/dev-stack.sh
```

After SSO, the workspace chrome embeds the agent runtime same-origin and exposes:

| Path | Purpose |
|------|---------|
| `/os/app/*` | Proxied agent execution runtime (framing blockers stripped) |
| `/api/indobase/proxy/*` | Session → project API (anon key) |
| `/api/session` | Linked project + `generation_context` + `agent_hint` |

Use **Copy agent hint** in the chrome bar (or `AGENT_HINT.md`).

Manual split (if you prefer two terminals):

```bash
./scripts/fetch-cloudflare-os.sh
cd upstream/cloudflare-os && pnpm install && pnpm run-local   # :8787
# other terminal:
cd bridge
export CLOUDFLARE_OS_URL=http://127.0.0.1:8787
export BUILDER_CFOS_HANDOFF_SECRET=…
pnpm dev   # :8791
```

`upstream/cloudflare-os` is gitignored — not vendored into the monorepo.

## Built-in formats (Docs / Sheets / Slides / Design)

Indobase owns format blueprints under [`formats/`](./formats/) so the gitignored
upstream clone stays clean. `format.design` is an in-Builder canvas for logos,
Instagram posts/stories, posters (presets + layers + PNG export).

Install into a local or VPS runtime (regenerates `format-blueprints.ts`):

```bash
./scripts/install-indobase-formats.sh
# then restart pnpm run-local / indobase-cfos-runtime
```

`dev-stack.sh` and `rebrand-cloudflare-os.mjs` call that install path.
Rebuild Design after editing `formats/src/design/`:

```bash
node formats/scripts/pack-gadget.mjs design
# bump revision in formats/workspace-design.json if a deployment already installed it
./scripts/install-indobase-formats.sh
```

Agent hints route logo/social/poster intents to **Design** (`format.design`), same
mechanism as Docs/Sheets/Slides — not to design.indobase.in.

## Layout

```
indobase-builder-cfos/
  bridge/            # Hono SSO + Indobase chrome + runtime reverse proxy
  formats/           # Indobase-owned Docs/Sheets/Slides/Design blueprints
  scripts/           # fetch runtime, mint handoff, dev-stack, install formats
  AGENT_HINT.md      # paste into agent chat (Indobase-only)
  upstream/          # gitignored clone of the execution runtime
  README.md
packages/cloudflare-adapter/   # Gen 3 concept map + MutationProposal → Commands
```

Studio code: `apps/studio/lib/api/saas/builder-cfos-launch.ts` + `builder/launch` runtime switch.

**Ports while integrated:** agent runtime `:8787` · Bridge `:8791` (embeds `/os/app/`).

## Gen 3 docs

- [`docs/BUILDER-GEN3.md`](../docs/BUILDER-GEN3.md) — ADR / ownership / anti-wrapper rules  
- [`docs/BUILDER-GEN3-STATUS.md`](../docs/BUILDER-GEN3-STATUS.md) — Phase 1 done + Phase 2+ backlog  
- [`docs/BUILDER-CFOS-POC.md`](../docs/BUILDER-CFOS-POC.md) — ops pointer  
