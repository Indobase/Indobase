# Builder hosted preview build execution

Replaces StackBlitz WebContainer for user Preview on deployed Builder.

> Naming: this is **hosted build execution**, not a strong OS sandbox. Isolation today =
> per-build tmp workdir + scrubbed child env + concurrency queue. Stronger boundaries
> (per-build containers) are a later phase.

## Flow

```text
Workspace Snapshot
        ↓
Execution (build + preview envelopes)
        ↓
Hosted build queue (concurrency 2)
        ↓
npm install + vite build (scrubbed env)
        ↓
/sandbox-preview/:id/  (or draft fallback)
```

1. Client commits workbench → Workspace Snapshot, materializes **frozen** files.
2. `POST /api/indobase/sandbox-preview` with `{ files, snapshotId }` (no client secrets).
3. Server runs under global hosted-build queue; child process env is allowlisted only.
4. Serves dist at `/sandbox-preview/<id>/`.
5. On failure → static `/draft-preview/<id>/`.

## Security (current)

| Control | Status |
|---------|--------|
| Scrubbed child env (no Builder secrets) | Yes |
| Reject client-supplied `env` body | Yes |
| Isolated tmp workdir + HOME=workdir | Yes |
| Shared npm cache under `/tmp/indobase-hosted-npm-cache` | Yes (perf) |
| Build queue concurrency 2 | Yes |
| Install/build timeouts | Yes |
| Network egress jail / cgroups / Docker | Not yet |

## Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `BUILDER_SANDBOX_VITE` | off | Experimental vite preview child |

## Staging first

Deploy to `builder.indobase.fun`, measure success rate / build time / memory, then promote to prod.
