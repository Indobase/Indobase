import type { MediaAsset, TimelineClip } from './types'
import { projectDuration } from './types'

export type ExportProgress = (ratio: number) => void

/**
 * Browser export via Canvas + MediaRecorder (WebM).
 * Plays the composed timeline into a canvas stream and muxes audio when present.
 */
export async function exportTimelineWebm(opts: {
  clips: TimelineClip[]
  mediaById: Map<string, MediaAsset>
  width: number
  height: number
  fps: number
  onProgress?: ExportProgress
  signal?: AbortSignal
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

  const mime =
    MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm'

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }))
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

    // Keep media element clocks roughly in sync for audio capture.
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
    // Pace roughly realtime so MediaRecorder gets steady frames.
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

  for (const clip of clips) {
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
