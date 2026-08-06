# Architecture (Gen-1)

**Companion to** [PLATFORM.md](./PLATFORM.md). Binding ABI detail lives in [CAPABILITIES.md](./CAPABILITIES.md).

```text
┌─────────────────────────────────────────────────────────────┐
│                     Product clients                         │
│   Builder · Design · Studio · Provisioner · future Agents   │
└───────────────────────────┬─────────────────────────────────┘
                            │ Commands / resolve / Execution
┌───────────────────────────▼─────────────────────────────────┐
│                 @indobase/platform (kernel)                 │
│  Identity · Workspace · Documents · Commands · Events       │
│  Capabilities (Resolver + Registry) · Execution             │
└───────────────────────────┬─────────────────────────────────┘
                            │ adapters
┌───────────────────────────▼─────────────────────────────────┐
│  Data plane (Vyom) · Product adapters (Payments, CRM, …)    │
│  See DATA-PLANE.md · product docs under docs/INDOBASE-*.md  │
└─────────────────────────────────────────────────────────────┘
```

## Rules of engagement

1. Platform concepts flow through the kernel — do not bypass with ad-hoc product URLs as SoT.  
2. `ProjectRuntime` is capabilities-only (plus tenant `dataPlane` credentials).  
3. Kernel never imports product packages.  
4. Gen-1 prefers wrapping existing behavior behind contracts over rewrites.

## Builder Gen 3

Agent execution runtime sits under `@indobase/cloudflare-adapter` — Indobase remains SoT. See [BUILDER-GEN3.md](./BUILDER-GEN3.md).

## Related

- [DATA-PLANE.md](./DATA-PLANE.md) — tenant Execution substrate  
- [EXECUTION.md](./EXECUTION.md) — Execution kinds  
- Ops handbooks remain under `docker/` and `docs/ENGINEERING-PLATFORM-HANDBOOK.md`
