import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { MediaAsset, TimelineClip } from './types'
import { projectDuration, sortClipsForDraw } from './types'

export type ExportProgress = (ratio: number) => void

export type ExportResult = {
  blob: Blob
  extension: 'mp4' | 'webm'
  mime: string
}

const FFMPEG_CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'

let ffmpegSingleton: FFmpeg | null = null
let ffmpegLoad: Promise<FFmpeg> | null = null

async function getFfmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton
  if (!ffmpegLoad) {
    ffmpegLoad = (async () => {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('log', ({ message }) => onLog?.(message))
      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      ffmpegSingleton = ffmpeg
      return ffmpeg
    })()
  }
  return ffmpegLoad
}

function pickWebmMime(): string {
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
    return 'video/webm;codecs=vp9,opus'
  }
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
    return 'video/webm;codecs=vp8,opus'
  }
  return 'video/webm'
}

function pickNativeMp4Mime(): string | null {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4',
  ]
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return null
}

/**
 * Browser timeline export via Canvas + MediaRecorder.
 * Used for WebM downloads and as the intermediate for FFmpeg MP4.
 */
export async function exportTimelineWebm(opts: {
  clips: TimelineClip[]
  mediaById: Map<string, MediaAsset>
  width: number
  height: number
  fps: number
  onProgress?: ExportProgress
  signal?: AbortSignal
  mimeType?: string
}): Promise<Blob> {
  const { clips, mediaById, width, height, fps, onProgress, signal } = opts
  const duration = Math.max(projectDuration(clips), 0.5)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported')

  const videoEls = new Map<string, HTMLVideoElement>()
  const imageEls = new Map<string, HTMLImageElement>()
  const audioEls: HTMLAudioElement[] = []

  for (const clip of clips) {
    if (!clip.mediaId) continue
    const asset = mediaById.get(clip.mediaId)
    if (!asset) continue
    if (asset.kind === 'video' && !videoEls.has(asset.id)) {
      const v = document.createElement('video')
      v.src = asset.objectUrl
      v.muted = true
      v.playsInline = true
      v.preload = 'auto'
      await waitEvent(v, 'loadeddata')
      videoEls.set(asset.id, v)
    }
    if (asset.kind === 'image' && !imageEls.has(asset.id)) {
      const img = new Image()
      img.src = asset.objectUrl
      await waitEvent(img, 'load')
      imageEls.set(asset.id, img)
    }
    if (asset.kind === 'audio' || asset.kind === 'video') {
      const a = document.createElement(asset.kind === 'audio' ? 'audio' : 'video') as
        | HTMLAudioElement
        | HTMLVideoElement
      a.src = asset.objectUrl
      a.preload = 'auto'
      ;(a as HTMLMediaElement).muted = false
      await waitEvent(a, 'loadeddata')
      audioEls.push(a as HTMLAudioElement)
    }
  }

  const stream = canvas.captureStream(fps)
  const audioCtx = new AudioContext()
  const dest = audioCtx.createMediaStreamDestination()
  let hasAudio = false
  for (const el of audioEls) {
    try {
      const src = audioCtx.createMediaElementSource(el)
      src.connect(dest)
      hasAudio = true
    } catch {
      // Already connected or blocked — ignore.
    }
  }
  if (hasAudio) {
    for (const track of dest.stream.getAudioTracks()) {
      stream.addTrack(track)
    }
  }

  const mime = opts.mimeType || pickWebmMime()
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(';')[0] }))
    recorder.onerror = () => reject(new Error('MediaRecorder failed'))
  })

  recorder.start(250)

  const frameInterval = 1 / fps
  let t = 0
  const startWall = performance.now()

  while (t <= duration) {
    if (signal?.aborted) {
      recorder.stop()
      await audioCtx.close().catch(() => undefined)
      throw new DOMException('Aborted', 'AbortError')
    }

    await drawFrame({
      ctx,
      width,
      height,
      time: t,
      clips,
      mediaById,
      videoEls,
      imageEls,
    })

    for (const clip of clips) {
      if (!clip.mediaId) continue
      const asset = mediaById.get(clip.mediaId)
      if (!asset) continue
      const local = t - clip.start + clip.trimIn
      if (t < clip.start || t > clip.start + clip.duration) continue
      if (asset.kind === 'video') {
        const v = videoEls.get(asset.id)
        if (v && Math.abs(v.currentTime - local) > 0.12) v.currentTime = local
      }
      for (const a of audioEls) {
        if (a.src === asset.objectUrl && Math.abs(a.currentTime - local) > 0.12) {
          a.currentTime = local
          void a.play().catch(() => undefined)
        }
      }
    }

    onProgress?.(Math.min(1, t / duration))
    t += frameInterval
    const targetWall = startWall + t * 1000
    const wait = targetWall - performance.now()
    if (wait > 0) await sleep(Math.min(wait, 40))
    else await sleep(0)
  }

  recorder.stop()
  for (const a of audioEls) {
    a.pause()
  }
  await audioCtx.close().catch(() => undefined)
  onProgress?.(1)
  return stopped
}

/**
 * Prefer native MP4 MediaRecorder when the browser supports it (often Safari).
 * Otherwise capture WebM and remux/transcode to H.264 AAC MP4 via ffmpeg.wasm.
 */
export async function exportTimelineMp4(opts: {
  clips: TimelineClip[]
  mediaById: Map<string, MediaAsset>
  width: number
  height: number
  fps: number
  onProgress?: ExportProgress
  signal?: AbortSignal
}): Promise<ExportResult> {
  const nativeMp4 = pickNativeMp4Mime()
  if (nativeMp4) {
    const blob = await exportTimelineWebm({
      ...opts,
      mimeType: nativeMp4,
      onProgress: (r) => opts.onProgress?.(r),
    })
    return { blob, extension: 'mp4', mime: 'video/mp4' }
  }

  const webm = await exportTimelineWebm({
    ...opts,
    onProgress: (r) => opts.onProgress?.(r * 0.62),
  })

  if (opts.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  opts.onProgress?.(0.64)
  const ffmpeg = await getFfmpeg()
  opts.onProgress?.(0.7)

  const onProgress = ({ progress }: { progress: number }) => {
    // ffmpeg progress is 0..1 for the encode phase
    opts.onProgress?.(0.7 + Math.min(1, Math.max(0, progress)) * 0.28)
  }
  ffmpeg.on('progress', onProgress)

  try {
    await ffmpeg.writeFile('input.webm', await fetchFile(webm))
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const code = await ffmpeg.exec([
      '-i',
      'input.webm',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      'output.mp4',
    ])
    if (code !== 0) {
      throw new Error(`MP4 encode failed (ffmpeg exit ${code})`)
    }
    const data = await ffmpeg.readFile('output.mp4')
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))
    // Copy into a standalone ArrayBuffer so BlobPart typing is satisfied (SharedArrayBuffer-safe).
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const blob = new Blob([copy.buffer], { type: 'video/mp4' })
    opts.onProgress?.(1)
    return { blob, extension: 'mp4', mime: 'video/mp4' }
  } finally {
    ffmpeg.off('progress', onProgress)
    try {
      await ffmpeg.deleteFile('input.webm')
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile('output.mp4')
    } catch {
      /* ignore */
    }
  }
}

async function drawFrame(opts: {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  time: number
  clips: TimelineClip[]
  mediaById: Map<string, MediaAsset>
  videoEls: Map<string, HTMLVideoElement>
  imageEls: Map<string, HTMLImageElement>
}) {
  const { ctx, width, height, time, clips, mediaById, videoEls, imageEls } = opts
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  for (const clip of sortClipsForDraw(clips)) {
    if (clip.kind === 'audio') continue
    if (time < clip.start || time > clip.start + clip.duration) continue
    const local = time - clip.start + clip.trimIn

    if (clip.kind === 'text') {
      ctx.fillStyle = clip.color || '#F0B429'
      ctx.font = `600 ${clip.fontSize || 48}px "Segoe UI", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(clip.text || 'Title', width / 2, height / 2)
      continue
    }

    if (!clip.mediaId) continue
    const asset = mediaById.get(clip.mediaId)
    if (!asset) continue

    if (asset.kind === 'video') {
      const v = videoEls.get(asset.id)
      if (!v) continue
      if (Math.abs(v.currentTime - local) > 0.05) {
        v.currentTime = local
        await waitSeek(v)
      }
      drawCover(ctx, v, width, height)
    } else if (asset.kind === 'image') {
      const img = imageEls.get(asset.id)
      if (img) drawCover(ctx, img, width, height)
    }
  }
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource & { videoWidth?: number; videoHeight?: number; width?: number; height?: number },
  width: number,
  height: number
) {
  const sw = ('videoWidth' in source && source.videoWidth) || source.width || width
  const sh = ('videoHeight' in source && source.videoHeight) || source.height || height
  const scale = Math.max(width / sw, height / sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = (width - dw) / 2
  const dy = (height - dh) / 2
  ctx.drawImage(source, dx, dy, dw, dh)
}

function waitEvent(target: EventTarget, event: string) {
  return new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error(`${event} failed`))
    }
    const cleanup = () => {
      target.removeEventListener(event, onOk)
      target.removeEventListener('error', onErr)
    }
    target.addEventListener(event, onOk, { once: true })
    target.addEventListener('error', onErr, { once: true })
  })
}

function waitSeek(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    if (!video.seeking) return resolve()
    video.addEventListener('seeked', () => resolve(), { once: true })
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
