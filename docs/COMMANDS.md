# Commands

**Contract #4** · Package: `@indobase/platform` → `commands/`

**Never mutate directly.** Every durable change is a Command.

## Envelope

```ts
type Command<TKind extends string = string, TPayload = unknown> = {
  id: CommandId
  kind: TKind
  payload: TPayload
  issuedAt: string           // ISO
  actor?: PlatformActor
  projectRef?: ProjectRef
  workspaceId?: WorkspaceId
  baseSnapshotId?: SnapshotId
  correlationId?: string     // links planner → executor → events
}
```

## Kind namespaces (examples)

| Prefix | Domain |
|--------|--------|
| `workspace.*` | File / snapshot mutations |
| `document.*` | Document CRUD / transform |
| `capability.*` | enable / ensure / inspect |
| `execution.*` | provision, repair, build, preview, backup |
| `identity.*` | rare — invite, role change (Studio) |

## Rules

1. Commands are append-only intent; commits produce Events + Snapshots.
2. Capability Commands never mutate via the Capability Resolver (read-only).
3. Execution Commands are the language Studio, Builder, and provisioner share.
4. Prefer metadata (`intent`, `reason`, `scope`) over exploding command type enums.

## Builder today

`GenerateProject` / `ModifyWorkspace` / `RunBuild` / `PublishDeployment` map to workspace + execution kinds as the bridge matures.
