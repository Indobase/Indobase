# Execution

**Contract #7** · Package: `@indobase/platform` → `execution/`

Execution is how work **runs**. Docker Compose, WebContainer, Vite server-build, and workflow runners are **adapters**.

## Canonical kinds

| Kind | Meaning | Today’s adapter |
|------|---------|-----------------|
| `execution.provision` | Create tenant stack | Provisioner `POST /provision` |
| `execution.repair` | Heal stack | `POST /repair-stack` |
| `execution.stop` | Pause stack | `POST /stop` |
| `execution.teardown` | Remove stack | `POST /teardown` |
| `execution.backup` | Logical backup | `POST /backup-tenant` |
| `execution.restore` | Restore backup | `POST /restore-tenant` |
| `execution.build` | Build artifacts | Builder server-build / WC build |
| `execution.preview` | Serve preview | Draft preview / WebContainer |
| `execution.publish` | Ship site / deploy | Studio publish + site routes |

## Envelope

```ts
type ExecutionRequest = {
  id: ExecutionId
  kind: ExecutionKind
  projectRef: ProjectRef
  commandId?: CommandId
  payload?: Record<string, unknown>
  reason?: string            // e.g. builder_preflight, project_create
}

type ExecutionResult = {
  executionId: ExecutionId
  ok: boolean
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  outputRef?: string
  error?: string
  health?: Record<string, unknown>
}
```

## Rules

1. Studio, Builder, and Workflows issue the **same** Execution command kinds.
2. Provisioner HTTP routes remain the transport; names above are the OS language.
3. Never leak Swarm task names or compose paths into the public ABI.
4. Health probes are part of ExecutionResult — not a separate product concept.

See [DATA-PLANE.md](./DATA-PLANE.md) for the Vyom substrate this adapter runs on.
