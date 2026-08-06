import type { ProjectRef, DocumentId, SnapshotId } from '../ids'
import { createDocumentId } from '../ids'

/**
 * Documents — first-class artifacts. Payload specialization stays in product adapters.
 */

export type DocumentKind =
  | 'project'
  | 'design'
  | 'campaign'
  | 'pipeline'
  | 'flow'
  | (string & {})

export type DocumentRef = {
  id: DocumentId
  kind: DocumentKind
  projectRef?: ProjectRef | string
  schemaVersion: number
}

/** Design-specific stub kept for Gen-1 exports. */
export type DesignDocumentRef = {
  id: string
  schemaVersion?: number
}

export type DesignCommandKind =
  | 'design.createNode'
  | 'design.moveNode'
  | 'design.deleteNode'
  | (string & {})

export type DesignDocumentContract = {
  ref: DesignDocumentRef
}

/**
 * Canonical Design document envelope — Fabric JSON is an adapter payload, not the SoT.
 * Gen-1 stub: kernel owns identity + kind; Design owns `payload` shape.
 */
export type DesignDocument<TPayload = unknown> = {
  ref: DocumentRef & { kind: 'design' }
  /** Adapter-owned (e.g. Fabric scene). Never import Fabric types into the kernel. */
  payload?: TPayload
  schemaVersion: number
  updatedAt?: number
}

/** Map a Design product id + optional Fabric payload into the kernel envelope. */
export function designToDocumentRef(input: {
  id?: string
  projectRef?: string
  schemaVersion?: number
}): DocumentRef {
  return createDocumentRef({
    kind: 'design',
    id: input.id as DocumentId | undefined,
    projectRef: input.projectRef,
    schemaVersion: input.schemaVersion,
  })
}

export function createDesignDocument<TPayload = unknown>(input: {
  id?: string
  projectRef?: string
  schemaVersion?: number
  payload?: TPayload
}): DesignDocument<TPayload> {
  const ref = designToDocumentRef(input) as DocumentRef & { kind: 'design' }
  return {
    ref,
    payload: input.payload,
    schemaVersion: input.schemaVersion ?? 1,
    updatedAt: Date.now(),
  }
}

export function createDocumentRef(input: {
  kind: DocumentKind
  projectRef?: string
  schemaVersion?: number
  id?: DocumentId
}): DocumentRef {
  return {
    id: input.id ?? createDocumentId(input.kind),
    kind: input.kind,
    projectRef: input.projectRef,
    schemaVersion: input.schemaVersion ?? 1,
  }
}

export type DocumentSnapshotMeta = {
  documentId: DocumentId
  snapshotId: SnapshotId
  parentSnapshotId: SnapshotId | null
}

/** Kind-agnostic document snapshot envelope — payload stays in product adapters. */
export type DocumentSnapshot<TPayload = unknown> = DocumentSnapshotMeta & {
  kind: DocumentKind
  schemaVersion: number
  payload?: TPayload
  createdAt: number
}

export function createDocumentSnapshot<TPayload = unknown>(input: {
  documentId: DocumentId | string
  snapshotId: SnapshotId
  parentSnapshotId?: SnapshotId | null
  kind: DocumentKind
  schemaVersion?: number
  payload?: TPayload
}): DocumentSnapshot<TPayload> {
  return {
    documentId: input.documentId as DocumentId,
    snapshotId: input.snapshotId,
    parentSnapshotId: input.parentSnapshotId ?? null,
    kind: input.kind,
    schemaVersion: input.schemaVersion ?? 1,
    payload: input.payload,
    createdAt: Date.now(),
  }
}
