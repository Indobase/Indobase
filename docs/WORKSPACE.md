# Workspace

**Contract #2** · Package: `@indobase/platform` → `workspace/`

A Workspace is a **live working session** bound to Identity (and usually a Project). It is not a product.

| Product surface | Workspace holds |
|-----------------|-----------------|
| Builder | Generated project files, snapshots, preview state |
| Design | Open design document, selection, history |
| Marketing | Campaign draft session |
| CRM | Pipeline editing session |

## Canonical shape

```ts
type Workspace = {
  id: WorkspaceId
  kind: WorkspaceKind          // 'builder' | 'design' | 'marketing' | 'crm' | …
  projectRef?: ProjectRef
  actor: PlatformActor
  headSnapshotId: SnapshotId   // for document-backed workspaces
  createdAt: number
}
```

## Rules

1. Mutations enter via **Commands**, commit as **Snapshots** (delta), emit **Events**.
2. Executors propose; Workspace validates and commits (Builder already follows this).
3. Multiple workspaces may exist per project (Builder + Design open together).
4. Reset/clear is an Execution or Command — not a silent store wipe without events.

## Builder today

`indobase-builder/app/lib/workspace/*` is the first concrete implementation. Types migrate into `@indobase/platform`; services stay in Builder until a shared runtime is justified.
