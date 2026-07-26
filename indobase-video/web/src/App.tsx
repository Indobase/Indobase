import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { exportTimelineMp4, exportTimelineWebm } from './lib/export'
import { loadProject, saveProject, sanitizeClips, storageKey } from './lib/storage'
import {
  base64ToBlob,
  fetchVideoQuota,
  generateStoryboard,
  listCloudProjects,
  saveCloudProject,
  synthesizeTts,
  type VideoAiQuota,
} from './lib/studio-api'
import {
  TRACKS,
  defaultTrackForKind,
  formatTime,
  projectDuration,
  sortClipsForDraw,
  uid,
  type MediaAsset,
  type MediaKind,
  type ProjectDocument,
  type SessionInfo,
  type TimelineClip,
  type TrackId,
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

async function probeBlobDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob)
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve()
      audio.onerror = () => reject(new Error('audio meta failed'))
    })
    return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 3
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [clips, setClips] = useState<TimelineClip[]>([])
  const [cloudId, setCloudId] = useState<string | undefined>()
  const [projectTitle, setProjectTitle] = useState('Untitled video')
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'cloud'>('idle')
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [textDraft, setTextDraft] = useState('Indobase')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiDuration, setAiDuration] = useState(30)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const [quota, setQuota] = useState<VideoAiQuota | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoCache = useRef(new Map<string, HTMLVideoElement>())
  const imageCache = useRef(new Map<string, HTMLImageElement>())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const trackRefs = useRef(new Map<TrackId, HTMLDivElement>())
  const saveTimer = useRef<number | null>(null)
  const canvasSize = useRef({ ...CANVAS })

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media])
  const duration = Math.max(projectDuration(clips), 1)
  const selected = clips.find((c) => c.id === selectedClipId) || null
  const pxPerSec = 48

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
        let restoredClips: TimelineClip[] = []
        let restoredMedia: MediaAsset[] = []
        let restoredCloudId: string | undefined
        let restoredTitle = 'Untitled video'

        try {
          const cloud = await listCloudProjects(me)
          if (cloud.latest?.doc) {
            restoredClips = sanitizeClips((cloud.latest.doc.clips || []) as TimelineClip[])
            restoredCloudId = cloud.latest.id
            restoredTitle = cloud.latest.title || cloud.latest.doc.title || restoredTitle
            if (cloud.latest.doc.canvas) {
              canvasSize.current = {
                width: cloud.latest.doc.canvas.width || CANVAS.width,
                height: cloud.latest.doc.canvas.height || CANVAS.height,
                fps: cloud.latest.doc.canvas.fps || CANVAS.fps,
              }
            }
          }
        } catch {
          // Cloud optional at boot — fall back to IndexedDB cache.
        }

        const local = await loadProject(key)
        if (local) {
          restoredMedia = local.media
          if (!restoredClips.length) {
            restoredClips = sanitizeClips(local.doc.clips)
            restoredCloudId = local.doc.cloudId || restoredCloudId
            restoredTitle = local.doc.title || restoredTitle
          }
        }

        if (cancelled) return
        setMedia(restoredMedia)
        setClips(restoredClips)
        setCloudId(restoredCloudId)
        setProjectTitle(restoredTitle)

        try {
          const q = await fetchVideoQuota(me)
          if (!cancelled) setQuota(q)
        } catch {
          /* ignore */
        }
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : 'Failed to start')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
        canvas: canvasSize.current,
        cloudId,
        title: projectTitle,
      }
      setSaveState('saving')
      void (async () => {
        try {
          await saveProject({
            key: storageKey(session.project_ref, session.sub),
            doc,
            media,
          })
          const saved = await saveCloudProject(session, {
            id: cloudId,
            title: projectTitle,
            doc,
          })
          setCloudId(saved.id)
          setSaveState('cloud')
        } catch {
          setSaveState('saved')
        }
      })()
    }, 900)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [session, clips, media, cloudId, projectTitle])

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
      const { width, height } = canvasSize.current
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)

      for (const clip of sortClipsForDraw(clips)) {
        if (clip.kind === 'audio') continue
        if (time < clip.start || time > clip.start + clip.duration) continue
        const local = time - clip.start + clip.trimIn

        if (clip.kind === 'text') {
          ctx.fillStyle = clip.color || '#F0B429'
          ctx.font = `600 ${clip.fontSize || 64}px "Segoe UI", system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(clip.text || 'Title', width / 2, height / 2)
          continue
        }

        if (!clip.mediaId) continue
        const asset = mediaById.get(clip.mediaId)
        if (!asset) continue

        if (asset.kind === 'video') {
          const v = await ensureVideo(asset)
          if (Math.abs(v.currentTime - local) > 0.04) v.currentTime = local
          const sw = v.videoWidth || width
          const sh = v.videoHeight || height
          const scale = Math.max(width / sw, height / sh)
          const dw = sw * scale
          const dh = sh * scale
          ctx.drawImage(v, (width - dw) / 2, (height - dh) / 2, dw, dh)
        } else if (asset.kind === 'image') {
          const img = await ensureImage(asset)
          const sw = img.naturalWidth
          const sh = img.naturalHeight
          const scale = Math.max(width / sw, height / sh)
          const dw = sw * scale
          const dh = sh * scale
          ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh)
        }
      }
    },
    [clips, mediaById, ensureVideo, ensureImage]
  )

  useEffect(() => {
    void drawPreview(playhead)
  }, [playhead, drawPreview])

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
      const trackId = defaultTrackForKind(meta.kind)
      if (meta.kind !== 'audio') {
        newClips.push({
          id: uid('clip'),
          kind: meta.kind,
          trackId,
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
          trackId: 'a1',
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
      trackId: 't1',
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
        width: canvasSize.current.width,
        height: canvasSize.current.height,
        fps: canvasSize.current.fps,
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
        width: canvasSize.current.width,
        height: canvasSize.current.height,
        fps: canvasSize.current.fps,
        onProgress: setExportProgress,
      })
      downloadBlob(blob, `${session?.project_ref || 'indobase'}-video.webm`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'WebM export failed')
    } finally {
      setExportProgress(null)
    }
  }

  const createWithAi = async () => {
    if (!session || !aiPrompt.trim() || aiBusy) return
    setAiBusy(true)
    setAiStatus('Writing storyboard…')
    try {
      const draft = await generateStoryboard(session, {
        prompt: aiPrompt.trim(),
        durationTargetSec: aiDuration,
        aspect: '16:9',
      })
      if (draft.quota) setQuota(draft.quota)
      setProjectTitle(draft.title || 'AI draft')

      const newMedia: MediaAsset[] = []
      const newClips: TimelineClip[] = []
      let cursor = 0
      let voiceNote: string | null = null

      for (let i = 0; i < draft.scenes.length; i++) {
        const scene = draft.scenes[i]
        const dur = Math.max(2, scene.durationSec || 4)
        newClips.push({
          id: uid('clip'),
          kind: 'text',
          trackId: 't1',
          start: cursor,
          duration: dur,
          trimIn: 0,
          sourceDuration: dur,
          text: scene.textOverlay || scene.title,
          fontSize: 56,
          color: '#F0B429',
        })

        if (scene.narration?.trim()) {
          setAiStatus(`Narrating scene ${i + 1}/${draft.scenes.length}…`)
          try {
            const tts = await synthesizeTts(session, { text: scene.narration.trim() })
            if (tts.available) {
              if (tts.quota) setQuota(tts.quota)
              const blob = base64ToBlob(tts.audioBase64, tts.mime)
              const audioDur = await probeBlobDuration(blob)
              const asset: MediaAsset = {
                id: uid('media'),
                name: `Narration ${i + 1}.${tts.extension}`,
                kind: 'audio',
                blob,
                objectUrl: URL.createObjectURL(blob),
                duration: audioDur,
              }
              newMedia.push(asset)
              newClips.push({
                id: uid('clip'),
                kind: 'audio',
                trackId: 'a1',
                mediaId: asset.id,
                start: cursor,
                duration: Math.min(audioDur, dur + 0.5),
                trimIn: 0,
                sourceDuration: audioDur,
              })
            } else {
              voiceNote = tts.message
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'TTS failed'
            voiceNote = msg
            if ((err as { code?: string }).code === 'video_ai_quota_exhausted') break
          }
        }

        cursor += dur
      }

      setMedia((m) => [...m, ...newMedia])
      setClips((c) => sanitizeClips([...c, ...newClips]))
      if (newClips[0]) setSelectedClipId(newClips[0].id)
      setAiStatus(
        voiceNote
          ? `Draft ready · ${draft.scenes.length} scenes (voice: ${voiceNote})`
          : `Draft ready · ${draft.scenes.length} scenes (${draft.model})`
      )
      try {
        setQuota(await fetchVideoQuota(session))
      } catch {
        /* ignore */
      }
    } catch (err) {
      setAiStatus(err instanceof Error ? err.message : 'AI generate failed')
    } finally {
      setAiBusy(false)
    }
  }

  const onTrackPointer = (trackId: TrackId, clientX: number) => {
    const el = trackRefs.current.get(trackId)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.min(Math.max(0, clientX - rect.left), rect.width)
    setPlayhead((x / (duration * pxPerSec)) * duration)
  }

  const moveClipToTrack = (clipId: string, trackId: TrackId) => {
    setClips((c) =>
      sanitizeClips(
        c.map((clip) => {
          if (clip.id !== clipId) return clip
          const track = TRACKS.find((t) => t.id === trackId)
          if (!track || !track.kinds.includes(clip.kind)) return clip
          return { ...clip, trackId }
        })
      )
    )
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

  const quotaLabel =
    quota == null
      ? null
      : quota.limit == null
        ? `AI unlimited · used ${quota.used}`
        : `AI ${quota.remaining ?? 0}/${quota.limit} left`

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
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'cloud'
                ? 'Cloud synced'
                : saveState === 'saved'
                  ? 'Local cache'
                  : 'Ready'}
          </span>
          {quotaLabel ? <span className="status-pill">{quotaLabel}</span> : null}
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
          <h2>Create with AI</h2>
          <div className="field">
            <label htmlFor="ai-prompt">Prompt</label>
            <textarea
              id="ai-prompt"
              rows={4}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="30s product explainer for Indobase Video…"
            />
          </div>
          <div className="field">
            <label htmlFor="ai-dur">Target duration (s)</label>
            <input
              id="ai-dur"
              type="number"
              min={8}
              max={90}
              value={aiDuration}
              onChange={(e) => setAiDuration(Math.max(8, Number(e.target.value) || 30))}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={aiBusy || !aiPrompt.trim()}
            onClick={() => void createWithAi()}
          >
            {aiBusy ? 'Generating…' : 'Generate draft'}
          </button>
          {aiStatus ? <p className="hint">{aiStatus}</p> : null}

          <h2 style={{ marginTop: '1.25rem' }}>Media library</h2>
          <div className="media-list">
            {media.length === 0 ? (
              <p className="hint">Import media or generate an AI draft to start.</p>
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
                      trackId: defaultTrackForKind(m.kind),
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
            <canvas
              ref={canvasRef}
              width={canvasSize.current.width}
              height={canvasSize.current.height}
            />
          </div>
          <div className="transport">
            <button type="button" className="btn btn-primary" onClick={() => setPlaying((p) => !p)}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPlaying(false)
                setPlayhead(0)
              }}
            >
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
            <label htmlFor="project-title">Project title</label>
            <input
              id="project-title"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
            />
          </div>
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
                  {selected.kind} · {selected.trackId}
                  {selected.text ? ` · “${selected.text}”` : ''}
                </div>
              </div>
              <div className="field">
                <label htmlFor="clip-track">Track</label>
                <select
                  id="clip-track"
                  value={selected.trackId}
                  onChange={(e) => moveClipToTrack(selected.id, e.target.value as TrackId)}
                >
                  {TRACKS.filter((t) => t.kinds.includes(selected.kind)).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
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
                  onChange={(e) =>
                    updateSelected({ duration: Math.max(0.1, Number(e.target.value) || 0.1) })
                  }
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
          <span className="hint">Multi-track · drag playhead · trim via inspector · split at playhead</span>
        </div>
        <div className="timeline-lanes" style={{ width: '100%', overflowX: 'auto' }}>
          {TRACKS.map((track) => (
            <div key={track.id} className="timeline-lane">
              <div className="lane-label">{track.label}</div>
              <div
                className="timeline-track"
                ref={(el) => {
                  if (el) trackRefs.current.set(track.id, el)
                }}
                onPointerDown={(e) => onTrackPointer(track.id, e.clientX)}
              >
                <div style={{ position: 'relative', width: duration * pxPerSec, height: '100%' }}>
                  {clips
                    .filter((c) => c.trackId === track.id)
                    .map((clip) => (
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
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
