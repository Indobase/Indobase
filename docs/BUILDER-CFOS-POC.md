# Builder Gen 3 PoC — agent execution runtime bridge

Same-day path: keep classic Builder offline; route Studio **Open Builder** to
`indobase-builder-cfos` when `BUILDER_USE_CFOS=1`.

**Gen 3 ownership:** Indobase owns workspace, commands, events, deploy, and identity.
The execution runtime (CF OS, internal) is behind `@indobase/cloudflare-adapter` —
never durable SoT, never customer-facing product naming.

- Architecture ADR: [`BUILDER-GEN3.md`](./BUILDER-GEN3.md)  
- Phase status / backlog: [`BUILDER-GEN3-STATUS.md`](./BUILDER-GEN3-STATUS.md)  
- Platform constitution: [`PLATFORM.md`](./PLATFORM.md)  
- Full steps: [`../indobase-builder-cfos/README.md`](../indobase-builder-cfos/README.md)

## Env (Studio)

```bash
BUILDER_USE_CFOS=1
BUILDER_CFOS_APP_URL=http://127.0.0.1:8791
BUILDER_CFOS_HANDOFF_SECRET=<same as bridge, >=32 chars>
# or reuse BUILDER_HANDOFF_SECRET
```

## Env (bridge)

```bash
BUILDER_CFOS_HANDOFF_SECRET=<same>
PORT=8791
CLOUDFLARE_OS_URL=http://127.0.0.1:8787   # internal execution substrate URL
```

## Integrated stack

```bash
./indobase-builder-cfos/scripts/dev-stack.sh
```

Bridge embeds the agent runtime at `/os/app/*` (session required) and proxies the project API at `/api/indobase/proxy/*`.  
`GET /api/session` includes `generation_context` + `agent_hint` from `@indobase/cloudflare-adapter`.

## Not in this PoC

- Publish / draft-preview / Android queue (classic Builder still owns these until Phase 2+)
- Prompt quotas / plan gates
- Full Gatekeeper inside the execution runtime (proxy + agent hint instead)
- Chat → Commands cutover (ActionRunner remains production mutation path until Gen 3 Phase 2)
