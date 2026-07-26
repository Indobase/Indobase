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

/** Timeline lanes: video bottom → overlay → text → audio. */
export type TrackId = 'v1' | 'v2' | 't1' | 'a1'

export const TRACKS: Array<{ id: TrackId; label: string; kinds: ClipKind[] }> = [
  { id: 'v1', label: 'Video', kinds: ['video', 'image'] },
  { id: 'v2', label: 'Overlay', kinds: ['video', 'image'] },
  { id: 't1', label: 'Text', kinds: ['text'] },
  { id: 'a1', label: 'Audio', kinds: ['audio'] },
]

/** Lower draw order first (video under text). */
export const TRACK_DRAW_ORDER: TrackId[] = ['v1', 'v2', 't1', 'a1']

export function defaultTrackForKind(kind: ClipKind): TrackId {
  if (kind === 'text') return 't1'
  if (kind === 'audio') return 'a1'
  return 'v1'
}

export type TimelineClip = {
  id: string
  kind: ClipKind
  trackId: TrackId
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
  /** Cloud row id when synced. */
  cloudId?: string
  title?: string
}

export type SessionInfo = {
  email: string
  sub: string
  project_ref: string
  project_name: string
  organization_slug: string
  role: string
  api_token?: string
  studio_url?: string
}

export type VideoSceneDraft = {
  title: string
  narration: string
  textOverlay: string
  durationSec: number
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

export function sortClipsForDraw(clips: TimelineClip[]): TimelineClip[] {
  const order = new Map(TRACK_DRAW_ORDER.map((id, i) => [id, i]))
  return [...clips].sort((a, b) => {
    const ta = order.get(a.trackId) ?? 99
    const tb = order.get(b.trackId) ?? 99
    if (ta !== tb) return ta - tb
    return a.start - b.start
  })
}
