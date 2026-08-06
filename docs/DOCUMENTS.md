# Documents

**Contract #3** · Package: `@indobase/platform` → `documents/`

Every product manipulates a **Document**. Documents are first-class, versioned, and command-driven.

| Product | Document kind |
|---------|----------------|
| Builder | `project` (source tree as document) |
| Design | `design` (DesignDocument — Fabric is an adapter) |
| Marketing | `campaign` |
| CRM | `pipeline` |
| Workflow | `flow` |

## Canonical shape

```ts
type DocumentRef = {
  id: DocumentId
  kind: DocumentKind
  projectRef?: ProjectRef
  schemaVersion: number
}

type DocumentSnapshot = {
  documentId: DocumentId
  snapshotId: SnapshotId
  parentSnapshotId: SnapshotId | null
  // kind-specific payload lives in adapters / product packages
}
```

## Rules

1. Renderer engines (Fabric, Vite preview, PDF) are **adapters**, never the document SoT.
2. Cross-product links use `DocumentRef` + Identity — this is how the business graph emerges.
3. Do not force every product onto one JSON schema; share envelope + kind, specialize payload.

## Status

Stub envelope in the kernel plus `createDocumentSnapshot` and typed `DesignDocument` / `designToDocumentRef`.  
Fabric JSON remains an **adapter payload** — full Design cutover is Phase 2. Builder project trees remain Workspace-backed.
