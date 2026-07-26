export type MediaKind = 'video' | 'audio' | 'image'

export type MediaAsset = {
  id: string
  name: string
  kind: MediaKind
  /** Object URL for preview / decode (session-local). */
  objectUrl: string
  /** Persisted blob for IndexedDB restore. */
  blob: Blob
  duration: number
  width?: number
  height?: number
}

export type ClipKind = MediaKind | 'text'

export type TimelineClip = {
  id: string
  kind: ClipKind
  /** Media asset id when kind is media. */
  mediaId?: string
  /** Timeline start (seconds). */
  start: number
  /** Visible duration on timeline (seconds). */
  duration: number
  /** Trim in from source start (seconds). */
  trimIn: number
  /** Source duration available (seconds). */
  sourceDuration: number
  text?: string
  fontSize?: number
  color?: string
}

export type ProjectDocument = {
  version: 1
  projectRef: string
  projectName: string
  updatedAt: number
  clips: TimelineClip[]
  canvas: { width: number; height: number; fps: number }
}

export type SessionInfo = {
  email: string
  sub: string
  project_ref: string
  project_name: string
  organization_slug: string
  role: string
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export function formatTime(seconds: number) {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rem = s - m * 60
  const whole = Math.floor(rem)
  const ms = Math.floor((rem - whole) * 10)
  return `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${ms}`
}

export function projectDuration(clips: TimelineClip[]) {
  return clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0)
}
