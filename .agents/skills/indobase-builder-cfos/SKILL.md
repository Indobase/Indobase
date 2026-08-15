---
name: indobase-builder-cfos
description: >-
  Work on Indobase Builder CFOS (builder.indobase.in Hono bridge, Vite+React
  scaffolds, commerce/leads/auth ABIs, production launch). Use when editing
  indobase-builder-cfos, builder agent skills, launch/MODIFY/preview, or
  @indobase/builder-agent.
---

# Indobase Builder CFOS

Production Builder lives in `indobase-builder-cfos/` (not Remix `indobase-builder/` unless the user names it). Ship on `main` → Vyom `.249` (`builder.indobase.in`).

## Agent skills + SDK

Source of truth: `packages/builder-agent` (`@indobase/builder-agent`).

- **Skills** — `composeGenerateSkillsHint(appType)` / `blueprintForAppType` inject GENERATE rules into `/api/session.launch.generate`.
- **App types** — `landing` (leads ABI), `saas` (auth ABI), `ecommerce` (commerce ABI).
- **SDK** — ABI types (`window.indobase.*`) + `BuilderAgentClient` for tool HTTP (not for published sites).

Bridge re-exports: `bridge/src/production-launch/agent-blueprint.ts`.

When changing how generated apps must wire Indobase, update `packages/builder-agent/src/skills/catalog.ts` first, then scaffolds under `bridge/src/production-launch/scaffold-vite-react.ts` and injectors in `bridge/src/ux/preview-artifact.ts`.

## Hard product rules

- Stack is **Vite + React + TypeScript** only (no React Native, no Next as live site).
- Never expose PocketBase / engine errors to operators or visitors.
- Ecommerce: `window.indobase.commerce` only — no client order POST or client price authority.
- Landing: enquiry form must use `window.indobase.leads` (dead forms fail Go Live).
- SaaS: `window.indobase.auth` OTP — not localStorage-only auth.
- Customer-safe copy only in UI and notify emails.

## Tests

```bash
cd packages/builder-agent && npm test
cd indobase-builder-cfos/bridge && npm test
```

## Deploy

Push `main`, wait for `roshanraghavander/indobase-builder-cfos:<sha>`, roll on `.249` with `IMAGE_TAG=<SHA> ./docker/scripts/deploy-indobase-builder-cfos-on-vps.sh`. Verify `https://builder.indobase.in/sso/health` `version` == SHA.
