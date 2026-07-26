/**
 * Client-side export helpers for Indobase Design.
 *
 * PNG/JPG use Fabric `toDataURL`. SVG uses `toSVG()`. PDF embeds a JPEG of the
 * canvas in a minimal single-page PDF (no third-party PDF library).
 *
 * Layer z-order controls (bring forward / send backward) follow the pattern from
 * Apache-2.0 Davronov/canva-clone — see NOTICE.md.
 */

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

function baseName(name?: string | null) {
  const raw = (name || 'design').trim() || 'design'
  return raw.replace(/[^\w\-]+/g, '_').slice(0, 80)
}

/** Build a one-page PDF that displays an embedded JPEG at the given pixel size. */
function jpegDataUrlToPdf(jpegDataUrl: string, widthPx: number, heightPx: number): Blob {
  const comma = jpegDataUrl.indexOf(',')
  const b64 = comma >= 0 ? jpegDataUrl.slice(comma + 1) : jpegDataUrl
  const binary = atob(b64)
  const jpegBytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) jpegBytes[i] = binary.charCodeAt(i)

  // PDF user space = 72 dpi; keep page size in points matching pixel aspect.
  const w = Math.max(1, Math.round(widthPx * 0.75))
  const h = Math.max(1, Math.round(heightPx * 0.75))

  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = [0]
  let cursor = 0

  const pushText = (s: string) => {
    const bytes = encoder.encode(s)
    parts.push(bytes)
    cursor += bytes.length
  }
  const pushBytes = (bytes: Uint8Array) => {
    parts.push(bytes)
    cursor += bytes.length
  }
  const markObj = () => {
    offsets.push(cursor)
  }

  pushText('%PDF-1.4\n')

  markObj()
  pushText('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n')

  markObj()
  pushText('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n')

  markObj()
  pushText(
    `3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>endobj\n`
  )

  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`
  markObj()
  pushText(`4 0 obj<< /Length ${content.length} >>stream\n${content}endstream\nendobj\n`)

  markObj()
  pushText(
    `5 0 obj<< /Type /XObject /Subtype /Image /Width ${Math.round(widthPx)} /Height ${Math.round(heightPx)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>stream\n`
  )
  pushBytes(jpegBytes)
  pushText('\nendstream\nendobj\n')

  const xrefStart = cursor
  pushText(`xref\n0 ${offsets.length}\n`)
  pushText('0000000000 65535 f \n')
  for (let i = 1; i < offsets.length; i++) {
    pushText(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }
  pushText(`trailer<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`)

  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return new Blob([out], { type: 'application/pdf' })
}

export type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf'

export function exportCanvas(
  canvas: {
    discardActiveObject: () => unknown
    requestRenderAll: () => unknown
    setActiveObject: (obj: unknown) => unknown
    getActiveObject: () => unknown
    toDataURL: (opts: Record<string, unknown>) => string
    toSVG: () => string
    getWidth: () => number
    getHeight: () => number
  },
  format: ExportFormat,
  designName?: string | null
) {
  const activeObj = canvas.getActiveObject()
  canvas.discardActiveObject()
  canvas.requestRenderAll()

  const name = baseName(designName)
  const width = canvas.getWidth()
  const height = canvas.getHeight()

  try {
    if (format === 'svg') {
      const svg = canvas.toSVG()
      downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${name}.svg`)
      return
    }

    if (format === 'png') {
      downloadDataUrl(
        canvas.toDataURL({ format: 'png', multiplier: 2, quality: 1 }),
        `${name}.png`
      )
      return
    }

    // JPG + PDF share a JPEG render of the canvas.
    const jpeg = canvas.toDataURL({ format: 'jpeg', multiplier: 2, quality: 0.92 })
    if (format === 'jpg') {
      downloadDataUrl(jpeg, `${name}.jpg`)
      return
    }

    downloadBlob(jpegDataUrlToPdf(jpeg, width * 2, height * 2), `${name}.pdf`)
  } finally {
    if (activeObj) {
      canvas.setActiveObject(activeObj)
      canvas.requestRenderAll()
    }
  }
}
