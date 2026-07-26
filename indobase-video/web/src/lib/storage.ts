import type { MediaAsset, ProjectDocument, TimelineClip, TrackId } from './types'
import { defaultTrackForKind } from './types'

const DB_NAME = 'indobase-video'
const DB_VERSION = 1
const STORE = 'projects'

type StoredMedia = {
  id: string
  name: string
  kind: MediaAsset['kind']
  blob: Blob
  duration: number
  width?: number
  height?: number
}

type StoredProject = {
  key: string
  doc: ProjectDocument
  media: StoredMedia[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function storageKey(projectRef: string, userSub: string) {
  return `ibv:${projectRef}:${userSub}`
}

export async function saveProject(opts: {
  key: string
  doc: ProjectDocument
  media: MediaAsset[]
}): Promise<void> {
  const db = await openDb()
  const record: StoredProject = {
    key: opts.key,
    doc: opts.doc,
    media: opts.media.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      blob: m.blob,
      duration: m.duration,
      width: m.width,
      height: m.height,
    })),
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadProject(key: string): Promise<{
  doc: ProjectDocument
  media: MediaAsset[]
} | null> {
  const db = await openDb()
  const record = await new Promise<StoredProject | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as StoredProject | undefined)
    req.onerror = () => reject(req.error)
  })
  db.close()
  if (!record) return null
  const media: MediaAsset[] = record.media.map((m) => ({
    ...m,
    objectUrl: URL.createObjectURL(m.blob),
  }))
  return { doc: record.doc, media }
}

function normalizeTrackId(clip: TimelineClip): TrackId {
  if (clip.trackId === 'v1' || clip.trackId === 'v2' || clip.trackId === 't1' || clip.trackId === 'a1') {
    return clip.trackId
  }
  return defaultTrackForKind(clip.kind)
}

export function sanitizeClips(clips: TimelineClip[]): TimelineClip[] {
  return clips
    .map((c) => ({
      ...c,
      trackId: normalizeTrackId(c),
      start: Math.max(0, c.start),
      duration: Math.max(0.1, c.duration),
      trimIn: Math.max(0, c.trimIn),
    }))
    .sort((a, b) => {
      if (a.trackId !== b.trackId) return a.trackId.localeCompare(b.trackId)
      return a.start - b.start
    })
}
