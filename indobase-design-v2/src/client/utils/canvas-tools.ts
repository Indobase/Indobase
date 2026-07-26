/**
 * Canvas object tools for Design-core Canva parity:
 * group/ungroup, align, distribute, shadow, magic resize.
 */
import * as fabric from 'fabric'

export function getActiveTargets(canvas: fabric.Canvas): fabric.FabricObject[] {
  const active = canvas.getActiveObject()
  if (!active) return []
  if (active instanceof fabric.ActiveSelection) {
    return active.getObjects()
  }
  return [active]
}

export async function groupSelection(canvas: fabric.Canvas): Promise<void> {
  const active = canvas.getActiveObject()
  if (!(active instanceof fabric.ActiveSelection) || active.size() < 2) return
  const group = await active.toGroup()
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
}

export async function ungroupSelection(canvas: fabric.Canvas): Promise<void> {
  const active = canvas.getActiveObject()
  if (!(active instanceof fabric.Group)) return
  const selection = await active.toActiveSelection()
  canvas.setActiveObject(selection)
  canvas.requestRenderAll()
}

type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export function alignObjects(
  canvas: fabric.Canvas,
  edge: AlignEdge,
  canvasWidth: number,
  canvasHeight: number
): void {
  const objs = getActiveTargets(canvas)
  if (!objs.length) return

  const bounds = objs.map((o) => o.getBoundingRect())
  const minL = Math.min(...bounds.map((b) => b.left))
  const maxR = Math.max(...bounds.map((b) => b.left + b.width))
  const minT = Math.min(...bounds.map((b) => b.top))
  const maxB = Math.max(...bounds.map((b) => b.top + b.height))
  const groupW = maxR - minL
  const groupH = maxB - minT

  // Single object → align to canvas; multi → align within selection bounds.
  const useCanvas = objs.length === 1

  objs.forEach((obj, i) => {
    const b = bounds[i]
    let left = obj.left || 0
    let top = obj.top || 0
    const dx = (obj.left || 0) - b.left
    const dy = (obj.top || 0) - b.top

    if (edge === 'left') left = (useCanvas ? 0 : minL) + dx
    if (edge === 'right') left = (useCanvas ? canvasWidth - b.width : maxR - b.width) + dx
    if (edge === 'center')
      left = (useCanvas ? (canvasWidth - b.width) / 2 : minL + (groupW - b.width) / 2) + dx
    if (edge === 'top') top = (useCanvas ? 0 : minT) + dy
    if (edge === 'bottom') top = (useCanvas ? canvasHeight - b.height : maxB - b.height) + dy
    if (edge === 'middle')
      top = (useCanvas ? (canvasHeight - b.height) / 2 : minT + (groupH - b.height) / 2) + dy

    obj.set({ left, top })
    obj.setCoords()
  })
  canvas.requestRenderAll()
}

export function distributeObjects(canvas: fabric.Canvas, axis: 'horizontal' | 'vertical'): void {
  const objs = getActiveTargets(canvas)
  if (objs.length < 3) return

  const decorated = objs
    .map((o) => ({ o, b: o.getBoundingRect() }))
    .sort((a, b) => (axis === 'horizontal' ? a.b.left - b.b.left : a.b.top - b.b.top))

  if (axis === 'horizontal') {
    const first = decorated[0].b.left
    const last = decorated[decorated.length - 1].b.left + decorated[decorated.length - 1].b.width
    const totalW = decorated.reduce((s, d) => s + d.b.width, 0)
    const gap = (last - first - totalW) / (decorated.length - 1)
    let cursor = first
    decorated.forEach(({ o, b }) => {
      const dx = (o.left || 0) - b.left
      o.set({ left: cursor + dx })
      o.setCoords()
      cursor += b.width + gap
    })
  } else {
    const first = decorated[0].b.top
    const last = decorated[decorated.length - 1].b.top + decorated[decorated.length - 1].b.height
    const totalH = decorated.reduce((s, d) => s + d.b.height, 0)
    const gap = (last - first - totalH) / (decorated.length - 1)
    let cursor = first
    decorated.forEach(({ o, b }) => {
      const dy = (o.top || 0) - b.top
      o.set({ top: cursor + dy })
      o.setCoords()
      cursor += b.height + gap
    })
  }
  canvas.requestRenderAll()
}

export function applyShadow(
  obj: fabric.FabricObject,
  opts: { color?: string; blur?: number; offsetX?: number; offsetY?: number } | null
): void {
  if (!opts) {
    obj.set('shadow', null)
    return
  }
  obj.set(
    'shadow',
    new fabric.Shadow({
      color: opts.color || 'rgba(0,0,0,0.35)',
      blur: opts.blur ?? 12,
      offsetX: opts.offsetX ?? 4,
      offsetY: opts.offsetY ?? 4,
    })
  )
}

export function magicResizeCanvasJson(
  canvasJson: string | Record<string, unknown>,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number
): string {
  const doc =
    typeof canvasJson === 'string'
      ? (JSON.parse(canvasJson) as { objects?: Record<string, unknown>[]; [k: string]: unknown })
      : { ...canvasJson }
  const sx = toW / Math.max(1, fromW)
  const sy = toH / Math.max(1, fromH)
  const scale = Math.min(sx, sy)
  const objects = Array.isArray(doc.objects) ? doc.objects : []

  doc.objects = objects.map((raw) => {
    const o = { ...raw }
    if (typeof o.left === 'number') o.left = Number(o.left) * sx
    if (typeof o.top === 'number') o.top = Number(o.top) * sy
    if (typeof o.scaleX === 'number') o.scaleX = Number(o.scaleX) * scale
    else if (typeof o.width === 'number') o.width = Number(o.width) * sx
    if (typeof o.scaleY === 'number') o.scaleY = Number(o.scaleY) * scale
    else if (typeof o.height === 'number') o.height = Number(o.height) * sy
    if (typeof o.fontSize === 'number') o.fontSize = Math.max(10, Math.round(Number(o.fontSize) * scale))
    if (typeof o.radius === 'number') o.radius = Number(o.radius) * scale
    return o
  })

  return JSON.stringify(doc)
}

/** Enable basic center snap while moving. */
export function attachSmartGuides(
  canvas: fabric.Canvas,
  canvasWidth: number,
  canvasHeight: number
): () => void {
  const SNAP = 8
  const onMoving = (e: { target?: fabric.FabricObject }) => {
    const t = e.target
    if (!t) return
    const b = t.getBoundingRect()
    const cx = b.left + b.width / 2
    const cy = b.top + b.height / 2
    const midX = canvasWidth / 2
    const midY = canvasHeight / 2
    if (Math.abs(cx - midX) < SNAP) {
      t.set({ left: (t.left || 0) + (midX - cx) })
    }
    if (Math.abs(cy - midY) < SNAP) {
      t.set({ top: (t.top || 0) + (midY - cy) })
    }
    if (Math.abs(b.left) < SNAP) t.set({ left: (t.left || 0) - b.left })
    if (Math.abs(b.top) < SNAP) t.set({ top: (t.top || 0) - b.top })
  }
  canvas.on('object:moving', onMoving)
  return () => {
    canvas.off('object:moving', onMoving)
  }
}
