# NOTICE

Indobase Design includes third-party open-source software.

## clawnify/open-design — MIT

The **editor client** (`src/client/`) is derived from
[clawnify/open-design](https://github.com/clawnify/open-design), Copyright (c) 2026 Clawnify,
licensed under the MIT License. The full upstream licence text is retained in
[`LICENSE.upstream`](./LICENSE.upstream).

### What was taken, and what was not

**Taken:** the Preact + Fabric.js editor client only.

**Not taken:** the upstream server. It targets Cloudflare Workers with a D1 binding and depends on
`@clawnify/app` and `@clawnify/db` — npm packages published without a licence field and without a
source repository. Building a product on unlicensed closed-source dependencies is not acceptable, and
Cloudflare Workers is incompatible with the self-hosted Docker/VPS model the rest of Indobase uses.
`src/server/` is therefore original work (Node + Hono + Postgres + Studio SSO).

### Modifications to the client

- Multi-tenant + Studio SSO instead of the upstream single-user, no-auth model.
- Fixed an upstream type error: `addPage` was declared `() => Promise<void>` in the context while the
  implementation accepted an optional `afterPageId`, so the "add page below" action did not typecheck.
- Indobase branding and the built-in India-first template library.

## Fonts

Google Fonts (SIL Open Font License 1.1), loaded at runtime. No fonts are redistributed in this
repository.

## Davronov/canva-clone — Apache-2.0

The **layers panel** z-order controls (`bringForward` / `sendBackwards` via Fabric, plus the
layers list UX in `src/client/components/layers-panel.tsx`) are adapted from
[Davronov-Alimardon/canva-clone](https://github.com/Davronov-Alimardon/canva-clone),
Copyright 2025 Alimardon Davronov, licensed under the Apache License, Version 2.0.
The full licence text is retained in [`LICENSE.davronov`](./LICENSE.davronov).

Modifications: rewritten for Preact + Fabric.js v6 APIs (`bringObjectForward` /
`sendObjectBackwards`), multi-page canvas map, and Indobase branding — not a verbatim copy of
upstream React/Next components.

## Template content

The built-in templates in `src/server/templates.ts` are original Indobase work, authored as Fabric.js
JSON. They embed no third-party imagery. Any stock photography a user adds is subject to that
provider's licence.
