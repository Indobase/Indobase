import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { exportTimelineMp4, exportTimelineWebm } from './lib/export'
import { loadProject, saveProject, sanitizeClips, storageKey } from './lib/storage'
import {
  formatTime,
  projectDuration,
  uid,
  type MediaAsset,
  type MediaKind,
  type ProjectDocument,
  type SessionInfo,
  type TimelineClip,
} from './lib/types'

const CANVAS = { width: 1280, height: 720, fps: 30 }

async function probeMedia(file: File): Promise<Omit<MediaAsset, 'id' | 'objectUrl' | 'blob'>> {
  const kind: MediaKind = file.type.startsWith('audio/')
    ? 'audio'
    : file.type.startsWith('image/')
      ? 'image'
      : 'video'
  const objectUrl = URL.createObjectURL(file)

  if (kind === 'image') {
    const img = new Image()
    img.src = objectUrl
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image'))
    })
    URL.revokeObjectURL(objectUrl)
    return {
      name: file.name,
      kind,
      duration: 5,
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
  }

  const el = document.createElement(kind === 'audio' ? 'audio' : 'video')
  el.preload = 'metadata'
  el.src = objectUrl
  await new Promise<void>((resolve, reject) => {
    el.onloadedmetadata = () => resolve()
    el.onerror = () => reject(new Error('Failed to load media'))
  })
  const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 5
  const width = 'videoWidth' in el ? el.videoWidth : undefined
  const height = 'videoHeight' in el ? el.videoHeight : undefined
  URL.revokeObjectURL(objectUrl)
  return { name: file.name, kind, duration, width, height }
}

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [clips, setClips] = useState<TimelineClip[]>([])
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [textDraft, setTextDraft] = useState('Indobase')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoCache = useRef(new Map<string, HTMLVideoElement>())
  const imageCache = useRef(new Map<string, HTMLImageElement>())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])
  const duration = Math.max(projectDuration(clips), 1)
  const selected = clips.find((c) => c.id === selectedClipId) || null
  const pxPerSec = 48

  // Boot session + restore
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/sso/me', { credentials: 'same-origin' })
        if (!res.ok) {
          const params = new URLSearchParams(window.location.search)
          const projectRef = params.get('project_ref') || ''
          const studio = import.meta.env.VITE_STUDIO_PUBLIC_URL || 'https://studio.indobase.in'
          const ret = projectRef
            ? `/project/${encodeURIComponent(projectRef)}/marketing`
            : '/'
          window.location.replace(`${studio}/sign-in?returnTo=${encodeURIComponent(ret)}`)
          return
        }
        const me = (await res.json()) as SessionInfo
        if (cancelled) return
        setSession(me)
        document.title = `Indobase Video · ${me.project_name || me.project_ref}`

        const key = storageKey(me.project_ref, me.sub)
        const restored = await loadProject(key)
        if (cancelled) return
        if (restored) {
          setMedia(restored.media)
          setClips(sanitizeClips(restored.doc.clips))
        }
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : 'Failed to start')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Autosave (debounced), scoped to Indobase project + user
  useEffect(() => {
    if (!session) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const doc: ProjectDocument = {
        version: 1,
        projectRef: session.project_ref,
        projectName: session.project_name,
        updatedAt: Date.now(),
        clips,
        canvas: CANVAS,
      }
      setSaveState('saving')
      void saveProject({
        key: storageKey(session.project_ref, session.sub),
        doc,
        media,
      })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('idle'))
    }, 700)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [session, clips, media])

  const ensureVideo = useCallback(async (asset: MediaAsset) => {
    let v = videoCache.current.get(asset.id)
    if (v) return v
    v = document.createElement('video')
    v.src = asset.objectUrl
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    await new Promise<void>((resolve, reject) => {
      v!.onloadeddata = () => resolve()
      v!.onerror = () => reject(new Error('video load failed'))
    })
    videoCache.current.set(asset.id, v)
    return v
  }, [])

  const ensureImage = useCallback(async (asset: MediaAsset) => {
    let img = imageCache.current.get(asset.id)
    if (img) return img
    img = new Image()
    img.src = asset.objectUrl
    await new Promise<void>((resolve, reject) => {
      img!.onload = () => resolve()
      img!.onerror = () => reject(new Error('image load failed'))
    })
    imageCache.current.set(asset.id, img)
    return img
  }, [])

  const drawPreview = useCallback(
    async (time: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, CANVAS.width, CANVAS.height)

      for (const clip of clips) {
        if (time < clip.start || time > clip.start + clip.duration) continue
        const local = time - clip.start + clip.trimIn

        if (clip.kind === 'text') {
          ctx.fillStyle = clip.color || '#F0B429'
          ctx.font = `600 ${clip.fontSize || 64}px "Segoe UI", system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(clip.text || 'Title', CANVAS.width / 2, CANVAS.height / 2)
          continue
        }

        if (!clip.mediaId) continue
        const asset = mediaById.get(clip.mediaId)
        if (!asset) continue

        if (asset.kind === 'video') {
          const v = await ensureVideo(asset)
          if (Math.abs(v.currentTime - local) > 0.04) v.currentTime = local
          const sw = v.videoWidth || CANVAS.width
          const sh = v.videoHeight || CANVAS.height
          const scale = Math.max(CANVAS.width / sw, CANVAS.height / sh)
          const dw = sw * scale
          const dh = sh * scale
          ctx.drawImage(v, (CANVAS.width - dw) / 2, (CANVAS.height - dh) / 2, dw, dh)
        } else if (asset.kind === 'image') {
          const img = await ensureImage(asset)
          const sw = img.naturalWidth
          const sh = img.naturalHeight
          const scale = Math.max(CANVAS.width / sw, CANVAS.height / sh)
          const dw = sw * scale
          const dh = sh * scale
          ctx.drawImage(img, (CANVAS.width - dw) / 2, (CANVAS.height - dh) / 2, dw, dh)
        }
      }
    },
    [clips, mediaById, ensureVideo, ensureImage]
  )

  useEffect(() => {
    void drawPreview(playhead)
  }, [playhead, drawPreview])

  // Playback loop
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setPlayhead((t) => {
        const next = t + dt
        if (next >= duration) {
          setPlaying(false)
          return duration
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration])

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const added: MediaAsset[] = []
    const newClips: TimelineClip[] = []
    let cursor = projectDuration(clips)

    for (const file of Array.from(files)) {
      if (!file.type.match(/^(video|audio|image)\//)) continue
      const meta = await probeMedia(file)
      const asset: MediaAsset = {
        id: uid('media'),
        blob: file,
        objectUrl: URL.createObjectURL(file),
        ...meta,
      }
      added.push(asset)
      if (meta.kind !== 'audio') {
        newClips.push({
          id: uid('clip'),
          kind: meta.kind,
          mediaId: asset.id,
          start: cursor,
          duration: Math.min(meta.duration, 30),
          trimIn: 0,
          sourceDuration: meta.duration,
        })
        cursor += Math.min(meta.duration, 30)
      } else {
        newClips.push({
          id: uid('clip'),
          kind: 'audio',
          mediaId: asset.id,
          start: 0,
          duration: meta.duration,
          trimIn: 0,
          sourceDuration: meta.duration,
        })
      }
    }
    setMedia((m) => [...m, ...added])
    setClips((c) => sanitizeClips([...c, ...newClips]))
    if (newClips[0]) setSelectedClipId(newClips[0].id)
  }

  const addTextClip = () => {
    const clip: TimelineClip = {
      id: uid('clip'),
      kind: 'text',
      start: playhead,
      duration: 3,
      trimIn: 0,
      sourceDuration: 3,
      text: textDraft || 'Title',
      fontSize: 64,
      color: '#F0B429',
    }
    setClips((c) => sanitizeClips([...c, clip]))
    setSelectedClipId(clip.id)
  }

  const splitSelected = () => {
    if (!selected || selected.kind === 'text') return
    const local = playhead - selected.start
    if (local <= 0.15 || local >= selected.duration - 0.15) return
    const left: TimelineClip = { ...selected, duration: local }
    const right: TimelineClip = {
      ...selected,
      id: uid('clip'),
      start: selected.start + local,
      duration: selected.duration - local,
      trimIn: selected.trimIn + local,
    }
    setClips((c) => sanitizeClips([...c.filter((x) => x.id !== selected.id), left, right]))
    setSelectedClipId(right.id)
  }

  const deleteSelected = () => {
    if (!selected) return
    setClips((c) => c.filter((x) => x.id !== selected.id))
    setSelectedClipId(null)
  }

  const updateSelected = (patch: Partial<TimelineClip>) => {
    if (!selected) return
    setClips((c) =>
      sanitizeClips(c.map((x) => (x.id === selected.id ? { ...x, ...patch } : x)))
    )
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exportMp4 = async () => {
    if (!clips.length) return
    setExportProgress(0)
    try {
      const result = await exportTimelineMp4({
        clips,
        mediaById,
        width: CANVAS.width,
        height: CANVAS.height,
        fps: CANVAS.fps,
        onProgress: setExportProgress,
      })
      downloadBlob(result.blob, `${session?.project_ref || 'indobase'}-video.${result.extension}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'MP4 export failed')
    } finally {
      setExportProgress(null)
    }
  }

  const exportWebm = async () => {
    if (!clips.length) return
    setExportProgress(0)
    try {
      const blob = await exportTimelineWebm({
        clips,
        mediaById,
        width: CANVAS.width,
        height: CANVAS.height,
        fps: CANVAS.fps,
        onProgress: setExportProgress,
      })
      downloadBlob(blob, `${session?.project_ref || 'indobase'}-video.webm`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'WebM export failed')
    } finally {
      setExportProgress(null)
    }
  }

  const onTrackPointer = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.min(Math.max(0, clientX - rect.left), rect.width)
    setPlayhead((x / (duration * pxPerSec)) * duration)
  }

  if (bootError) {
    return (
      <div className="splash">
        <img src="/indobase-logo.svg" alt="Indobase" />
        <h1>Indobase Video</h1>
        <p className="hint">{bootError}</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="splash">
        <img src="/indobase-logo.svg" alt="Indobase" />
        <h1>Indobase Video</h1>
        <p className="hint">Loading Studio session…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/indobase-logo.svg" alt="" />
          <div>
            <h1>Indobase Video</h1>
            <div className="meta">
              {session.project_name} · {session.project_ref} · {session.email}
            </div>
          </div>
        </div>
        <div className="toolbar">
          <span className="status-pill">
            <span className="dot" />
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Autosaved' : 'Ready'}
          </span>
          <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
            Import media
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,image/*"
            multiple
            hidden
            onChange={(e) => void importFiles(e.target.files)}
          />
          <button
            type="button"
            className="btn-primary btn"
            onClick={() => void exportMp4()}
            disabled={!clips.length || exportProgress !== null}
            title="H.264 MP4 (native when available, otherwise FFmpeg in the browser)"
          >
            {exportProgress !== null ? `Exporting ${Math.round(exportProgress * 100)}%` : 'Export MP4'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void exportWebm()}
            disabled={!clips.length || exportProgress !== null}
          >
            Export WebM
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="panel">
          <h2>Media library</h2>
          <div className="media-list">
            {media.length === 0 ? (
              <p className="hint">Import video, audio, or images to start editing.</p>
            ) : (
              media.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="media-item"
                  onClick={() => {
                    const clip: TimelineClip = {
                      id: uid('clip'),
                      kind: m.kind,
                      mediaId: m.id,
                      start: playhead,
                      duration: Math.min(m.duration, 10),
                      trimIn: 0,
                      sourceDuration: m.duration,
                    }
                    setClips((c) => sanitizeClips([...c, clip]))
                    setSelectedClipId(clip.id)
                  }}
                >
                  {m.kind === 'image' || m.kind === 'video' ? (
                    <img className="media-thumb" src={m.objectUrl} alt="" />
                  ) : (
                    <div className="media-thumb" />
                  )}
                  <div>
                    <div className="name">{m.name}</div>
                    <div className="hint">
                      {m.kind} · {formatTime(m.duration)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="preview-wrap">
          <div className="preview-stage">
            <canvas ref={canvasRef} width={CANVAS.width} height={CANVAS.height} />
          </div>
          <div className="transport">
            <button type="button" className="btn btn-primary" onClick={() => setPlaying((p) => !p)}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="btn" onClick={() => { setPlaying(false); setPlayhead(0) }}>
              Stop
            </button>
            <span className="time">
              {formatTime(playhead)} / {formatTime(duration)}
            </span>
            {exportProgress !== null ? (
              <div className="export-progress" style={{ flex: 1 }}>
                <span style={{ width: `${Math.round(exportProgress * 100)}%` }} />
              </div>
            ) : null}
          </div>
        </section>

        <aside className="panel">
          <h2>Inspector</h2>
          <div className="field">
            <label htmlFor="title-text">Add title</label>
            <input
              id="title-text"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Title text"
            />
            <button type="button" className="btn" onClick={addTextClip}>
              Add text clip
            </button>
          </div>

          {selected ? (
            <>
              <div className="field">
                <label>Selected clip</label>
                <div className="hint">
                  {selected.kind}
                  {selected.text ? ` · “${selected.text}”` : ''}
                </div>
              </div>
              {selected.kind === 'text' ? (
                <>
                  <div className="field">
                    <label htmlFor="clip-text">Text</label>
                    <input
                      id="clip-text"
                      value={selected.text || ''}
                      onChange={(e) => updateSelected({ text: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="clip-size">Font size</label>
                    <input
                      id="clip-size"
                      type="number"
                      min={16}
                      max={160}
                      value={selected.fontSize || 64}
                      onChange={(e) => updateSelected({ fontSize: Number(e.target.value) || 64 })}
                    />
                  </div>
                </>
              ) : null}
              <div className="field">
                <label htmlFor="clip-dur">Duration (s)</label>
                <input
                  id="clip-dur"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={Number(selected.duration.toFixed(2))}
                  onChange={(e) => updateSelected({ duration: Math.max(0.1, Number(e.target.value) || 0.1) })}
                />
              </div>
              <div className="field">
                <label htmlFor="clip-trim">Trim in (s)</label>
                <input
                  id="clip-trim"
                  type="number"
                  min={0}
                  step={0.1}
                  value={Number(selected.trimIn.toFixed(2))}
                  onChange={(e) => updateSelected({ trimIn: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
              <div className="toolbar">
                <button type="button" className="btn" onClick={splitSelected} disabled={selected.kind === 'text'}>
                  Split at playhead
                </button>
                <button type="button" className="btn" onClick={deleteSelected}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p className="hint">Select a clip on the timeline to trim, split, or edit text.</p>
          )}
        </aside>
      </div>

      <section className="timeline">
        <div className="timeline-header">
          <h2 style={{ margin: 0 }}>Timeline</h2>
          <span className="hint">Drag playhead · trim via inspector · split at playhead</span>
        </div>
        <div
          className="timeline-track"
          ref={trackRef}
          style={{ width: '100%', overflowX: 'auto' }}
          onPointerDown={(e) => onTrackPointer(e.clientX)}
        >
          <div style={{ position: 'relative', width: duration * pxPerSec, height: '100%' }}>
            {clips.map((clip) => (
              <div
                key={clip.id}
                className={`clip ${clip.kind} ${clip.id === selectedClipId ? 'selected' : ''}`}
                style={{
                  left: clip.start * pxPerSec,
                  width: Math.max(24, clip.duration * pxPerSec),
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedClipId(clip.id)
                }}
                title={clip.text || clip.kind}
              >
                {clip.kind === 'text' ? clip.text : clip.kind}
              </div>
            ))}
            <div className="playhead" style={{ left: playhead * pxPerSec }} />
          </div>
        </div>
      </section>
    </div>
  )
}
