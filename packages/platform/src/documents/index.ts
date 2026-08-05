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
