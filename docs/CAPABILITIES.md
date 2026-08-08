# Capabilities

**Contract #6** · Package: `@indobase/platform` → `capabilities/`  
**Orchestrator:** [adr/0006-capability-orchestrator.md](./adr/0006-capability-orchestrator.md) · [INDOBASE-OS.md](./INDOBASE-OS.md)

Capabilities describe **what a business can do** — not which vendor or Indobase “product app” exists.

**Binding UX:** customers and agents **enable** Indobase capabilities. They never **connect** external products. Provider choice lives only in hidden adapters.

## Customer language ↔ ABI

| Customer / chat | Capability id | Not |
|-----------------|---------------|-----|
| Customer Login | `auth` | Connect Auth / GoTrue / Clerk |
| Business Data | `businessData` | Connect Neon / Postgres |
| File Storage | `storage` | Connect S3 |
| Payments | `commerce` | Connect Stripe / Razorpay UI |
| Analytics | `events` | Connect analytics host |
| Email | `email` | Connect ESP |
| (catalog / functions) | `catalog` / `functions` | Product consoles |

**Commerce vs Payments:** ABI id is always `commerce`. Chrome says **Payments** / “Start accepting payments.”

## Layers

```text
Capability
  → Contract verbs (intents)
  → Permissions (role/plan gated via ResolveRuntimeInput.actor — input only)
  → Bindings (env, sdk, endpoints — how this project wires it)
```

## Project Runtime ABI (binding)

`Platform.resolve` / `resolveProjectRuntime` returns **only**:

```ts
ProjectRuntime = {
  schemaVersion: 1
  runtimeVersion: number
  projectRef: string
  dataPlane: { url, anonKey }  // tenant credentials for bindings — not Studio/product hosts
  capabilities: Partial<Record<CapabilityId, CapabilityDescriptor>>
}
```

**Forbidden as first-class ABI fields** (see `FORBIDDEN_RUNTIME_ABI_KEYS`):

- billing status / plan as output  
- Studio URLs / product marketing hosts  
- internal control-plane APIs  
- deployment topology / hostnames registry  

Deploy helpers may still attach `INDOBASE_STUDIO_URL` **outside** the ABI (Builder `deployEnv`).

## Resolver vs Ensurer

| Path | Role |
|------|------|
| **Resolver** | Read-only gateway: “what can this app assume?” |
| **Ensurer** | Mutations via Commands: make a capability true |

```text
Prompt → Planner → Capability Resolver → Generation Context → LLM
```

Use `buildGenerationCapabilityContext(runtime)` / `Platform.formatGenerationCapabilityContextPrompt(runtime)` for agents and Builder codegen. Do not invent product hosts as source of truth.

## Gen-1

Registered: `auth`, `commerce`, `events`, `businessData`, `catalog`, `functions`.  
Only `auth` auto-binds from data-plane URL + anon key today; others require Ensurer/Studio descriptors.
