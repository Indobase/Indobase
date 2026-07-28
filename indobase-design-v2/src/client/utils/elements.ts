/**
 * Elements library — MIT-friendly inline SVG paths + shape presets.
 * Categories: Shapes, Graphics, Frames, Grids, Stickers.
 */
import * as fabric from 'fabric'

export type ElementCategory = 'shapes' | 'graphics' | 'frames' | 'grids' | 'stickers'

export type ElementDef = {
  id: string
  label: string
  category: ElementCategory
  preview?: string
  add: (canvas: fabric.Canvas, cx: number, cy: number) => void
}

export const ELEMENT_CATEGORIES: {
  key: ElementCategory
  label: string
  color: string
  description: string
}[] = [
  { key: 'shapes', label: 'Shapes', color: '#8b3dff', description: 'Basic & decorative shapes' },
  { key: 'graphics', label: 'Graphics', color: '#ec4899', description: 'Icons & accents' },
  { key: 'frames', label: 'Frames', color: '#3B8FD6', description: 'Photo & border frames' },
  { key: 'grids', label: 'Grids', color: '#059669', description: 'Layout grids' },
  { key: 'stickers', label: 'Stickers', color: '#f97316', description: 'Fun stickers & badges' },
]

function addPath(canvas: fabric.Canvas, path: string, opts: Record<string, unknown>) {
  const p = new fabric.Path(path, {
    fill: '#8b3dff',
    strokeWidth: 0,
    ...opts,
  })
  canvas.add(p)
  canvas.setActiveObject(p)
  canvas.requestRenderAll()
}

function addShapeRect(
  canvas: fabric.Canvas,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fill: string,
  rx = 8
) {
  const obj = new fabric.Rect({
    left: cx - w / 2,
    top: cy - h / 2,
    width: w,
    height: h,
    rx,
    ry: rx,
    fill,
    strokeWidth: 0,
  })
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
}

function addGrid(
  canvas: fabric.Canvas,
  cx: number,
  cy: number,
  cols: number,
  rows: number,
  cell: number,
  gap: number,
  stroke = '#CBD5E1'
) {
  const totalW = cols * cell + (cols - 1) * gap
  const totalH = rows * cell + (rows - 1) * gap
  const startX = cx - totalW / 2
  const startY = cy - totalH / 2
  const cells: fabric.FabricObject[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellRect = new fabric.Rect({
        left: startX + c * (cell + gap),
        top: startY + r * (cell + gap),
        width: cell,
        height: cell,
        fill: '#F8FAFC',
        stroke,
        strokeWidth: 2,
        rx: 4,
        ry: 4,
      })
      cells.push(cellRect)
    }
  }

  const group = new fabric.Group(cells, {
    subTargetCheck: false,
  })
  canvas.add(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
}

export const ELEMENTS: ElementDef[] = [
  // ── Shapes ──────────────────────────────────────────────────────────
  {
    id: 'rect',
    label: 'Rectangle',
    category: 'shapes',
    add: (c, cx, cy) => addShapeRect(c, cx, cy, 160, 120, '#8b3dff'),
  },
  {
    id: 'circle',
    label: 'Circle',
    category: 'shapes',
    add: (c, cx, cy) => {
      const obj = new fabric.Circle({
        left: cx - 70,
        top: cy - 70,
        radius: 70,
        fill: '#8b3dff',
      })
      c.add(obj)
      c.setActiveObject(obj)
      c.requestRenderAll()
    },
  },
  {
    id: 'triangle',
    label: 'Triangle',
    category: 'shapes',
    add: (c, cx, cy) => {
      const obj = new fabric.Triangle({
        left: cx - 70,
        top: cy - 70,
        width: 140,
        height: 140,
        fill: '#8b3dff',
      })
      c.add(obj)
      c.setActiveObject(obj)
      c.requestRenderAll()
    },
  },
  {
    id: 'line',
    label: 'Line',
    category: 'shapes',
    add: (c, cx, cy) => {
      const obj = new fabric.Line([cx - 100, cy, cx + 100, cy], {
        stroke: '#8b3dff',
        strokeWidth: 4,
        fill: '',
      })
      c.add(obj)
      c.setActiveObject(obj)
      c.requestRenderAll()
    },
  },
  {
    id: 'star',
    label: 'Star',
    category: 'shapes',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M 50 5 L 61 35 L 95 35 L 67 57 L 79 91 L 50 70 L 21 91 L 33 57 L 5 35 L 39 35 Z',
        { left: cx - 50, top: cy - 50, scaleX: 1.2, scaleY: 1.2 }
      ),
  },
  {
    id: 'heart',
    label: 'Heart',
    category: 'shapes',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M 50 88 C 20 65 5 45 5 28 C 5 12 18 5 30 5 C 40 5 48 12 50 20 C 52 12 60 5 70 5 C 82 5 95 12 95 28 C 95 45 80 65 50 88 Z',
        { left: cx - 50, top: cy - 50, fill: '#E8618C' }
      ),
  },
  {
    id: 'arrow',
    label: 'Arrow',
    category: 'shapes',
    add: (c, cx, cy) =>
      addPath(c, 'M 10 40 L 60 40 L 60 20 L 95 50 L 60 80 L 60 60 L 10 60 Z', {
        left: cx - 50,
        top: cy - 40,
        fill: '#3B8FD6',
      }),
  },
  {
    id: 'hex',
    label: 'Hexagon',
    category: 'shapes',
    add: (c, cx, cy) =>
      addPath(c, 'M 50 5 L 90 28 L 90 72 L 50 95 L 10 72 L 10 28 Z', {
        left: cx - 50,
        top: cy - 50,
        fill: '#F5A524',
      }),
  },
  {
    id: 'diamond',
    label: 'Diamond',
    category: 'shapes',
    add: (c, cx, cy) =>
      addPath(c, 'M 50 5 L 95 50 L 50 95 L 5 50 Z', {
        left: cx - 50,
        top: cy - 50,
        fill: '#7C3AED',
      }),
  },
  {
    id: 'pill',
    label: 'Pill',
    category: 'shapes',
    add: (c, cx, cy) => addShapeRect(c, cx, cy, 200, 64, '#8b3dff', 32),
  },

  // ── Graphics ────────────────────────────────────────────────────────
  {
    id: 'check',
    label: 'Check',
    category: 'graphics',
    add: (c, cx, cy) =>
      addPath(c, 'M 12 50 L 38 76 L 88 20 L 76 10 L 38 54 L 24 40 Z', {
        left: cx - 45,
        top: cy - 40,
        fill: '#059669',
      }),
  },
  {
    id: 'burst',
    label: 'Burst',
    category: 'graphics',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M50 0 L58 35 L95 28 L68 55 L85 90 L50 70 L15 90 L32 55 L5 28 L42 35 Z',
        { left: cx - 48, top: cy - 48, fill: '#F5A524' }
      ),
  },
  {
    id: 'cloud',
    label: 'Cloud',
    category: 'graphics',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M 25 70 C 10 70 5 58 12 50 C 8 38 18 28 32 30 C 38 18 52 15 62 24 C 72 18 88 22 92 36 C 98 38 100 48 94 56 C 98 64 90 72 80 70 Z',
        { left: cx - 50, top: cy - 40, fill: '#94A3B8' }
      ),
  },
  {
    id: 'bolt',
    label: 'Lightning',
    category: 'graphics',
    add: (c, cx, cy) =>
      addPath(c, 'M 55 5 L 20 55 L 45 55 L 35 95 L 80 40 L 52 40 Z', {
        left: cx - 50,
        top: cy - 50,
        fill: '#FBBF24',
      }),
  },
  {
    id: 'chat',
    label: 'Chat bubble',
    category: 'graphics',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M 10 15 L 90 15 L 90 65 L 55 65 L 40 85 L 40 65 L 10 65 Z',
        { left: cx - 50, top: cy - 50, fill: '#3B8FD6', rx: 8 }
      ),
  },
  {
    id: 'location',
    label: 'Pin',
    category: 'graphics',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M 50 95 C 50 95 10 55 10 35 C 10 15 28 5 50 5 C 72 5 90 15 90 35 C 90 55 50 95 50 95 Z M 50 48 C 58 48 65 41 65 33 C 65 25 58 18 50 18 C 42 18 35 25 35 33 C 35 41 42 48 50 48 Z',
        { left: cx - 50, top: cy - 50, fill: '#DC2626' }
      ),
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    category: 'graphics',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M 50 0 L 54 38 L 92 42 L 54 46 L 50 84 L 46 46 L 8 42 L 46 38 Z',
        { left: cx - 46, top: cy - 42, fill: '#8b3dff' }
      ),
  },

  // ── Frames ──────────────────────────────────────────────────────────
  {
    id: 'frame-circle',
    label: 'Circle frame',
    category: 'frames',
    add: (c, cx, cy) => {
      const ring = new fabric.Circle({
        left: cx - 90,
        top: cy - 90,
        radius: 90,
        fill: 'transparent',
        stroke: '#111827',
        strokeWidth: 8,
      })
      c.add(ring)
      c.setActiveObject(ring)
      c.requestRenderAll()
    },
  },
  {
    id: 'frame-rect',
    label: 'Photo frame',
    category: 'frames',
    add: (c, cx, cy) => {
      const frame = new fabric.Rect({
        left: cx - 120,
        top: cy - 90,
        width: 240,
        height: 180,
        fill: '#F8FAFC',
        stroke: '#0F172A',
        strokeWidth: 10,
        rx: 4,
        ry: 4,
      })
      c.add(frame)
      c.setActiveObject(frame)
      c.requestRenderAll()
    },
  },
  {
    id: 'frame-rounded',
    label: 'Rounded frame',
    category: 'frames',
    add: (c, cx, cy) => {
      const frame = new fabric.Rect({
        left: cx - 110,
        top: cy - 110,
        width: 220,
        height: 220,
        fill: '#FFFFFF',
        stroke: '#8b3dff',
        strokeWidth: 6,
        rx: 24,
        ry: 24,
      })
      c.add(frame)
      c.setActiveObject(frame)
      c.requestRenderAll()
    },
  },
  {
    id: 'frame-polaroid',
    label: 'Polaroid',
    category: 'frames',
    add: (c, cx, cy) => {
      const outer = new fabric.Rect({
        left: cx - 100,
        top: cy - 120,
        width: 200,
        height: 240,
        fill: '#FFFFFF',
        stroke: '#E2E8F0',
        strokeWidth: 2,
        rx: 4,
        ry: 4,
      })
      const inner = new fabric.Rect({
        left: cx - 88,
        top: cy - 108,
        width: 176,
        height: 160,
        fill: '#F1F5F9',
        stroke: '#CBD5E1',
        strokeWidth: 1,
      })
      const group = new fabric.Group([outer, inner])
      c.add(group)
      c.setActiveObject(group)
      c.requestRenderAll()
    },
  },
  {
    id: 'frame-double',
    label: 'Double border',
    category: 'frames',
    add: (c, cx, cy) => {
      const outer = new fabric.Rect({
        left: cx - 130,
        top: cy - 95,
        width: 260,
        height: 190,
        fill: 'transparent',
        stroke: '#0F172A',
        strokeWidth: 4,
        rx: 2,
        ry: 2,
      })
      const inner = new fabric.Rect({
        left: cx - 118,
        top: cy - 83,
        width: 236,
        height: 166,
        fill: '#F8FAFC',
        stroke: '#0F172A',
        strokeWidth: 2,
        rx: 2,
        ry: 2,
      })
      const group = new fabric.Group([outer, inner])
      c.add(group)
      c.setActiveObject(group)
      c.requestRenderAll()
    },
  },

  // ── Grids ───────────────────────────────────────────────────────────
  {
    id: 'grid-2x2',
    label: '2 × 2',
    category: 'grids',
    add: (c, cx, cy) => addGrid(c, cx, cy, 2, 2, 100, 12),
  },
  {
    id: 'grid-3x3',
    label: '3 × 3',
    category: 'grids',
    add: (c, cx, cy) => addGrid(c, cx, cy, 3, 3, 72, 10),
  },
  {
    id: 'grid-2x3',
    label: '2 × 3',
    category: 'grids',
    add: (c, cx, cy) => addGrid(c, cx, cy, 2, 3, 90, 12),
  },
  {
    id: 'grid-1x3',
    label: '1 × 3 strip',
    category: 'grids',
    add: (c, cx, cy) => addGrid(c, cx, cy, 3, 1, 100, 12),
  },
  {
    id: 'grid-collage',
    label: 'Collage',
    category: 'grids',
    add: (c, cx, cy) => {
      const cells = [
        new fabric.Rect({ left: cx - 160, top: cy - 110, width: 210, height: 220, fill: '#F8FAFC', stroke: '#CBD5E1', strokeWidth: 2, rx: 4, ry: 4 }),
        new fabric.Rect({ left: cx + 58, top: cy - 110, width: 102, height: 102, fill: '#F8FAFC', stroke: '#CBD5E1', strokeWidth: 2, rx: 4, ry: 4 }),
        new fabric.Rect({ left: cx + 58, top: cy + 8, width: 102, height: 102, fill: '#F8FAFC', stroke: '#CBD5E1', strokeWidth: 2, rx: 4, ry: 4 }),
      ]
      const group = new fabric.Group(cells)
      c.add(group)
      c.setActiveObject(group)
      c.requestRenderAll()
    },
  },

  // ── Stickers ────────────────────────────────────────────────────────
  {
    id: 'sticker-smile',
    label: 'Smiley',
    category: 'stickers',
    add: (c, cx, cy) => {
      const face = new fabric.Circle({ left: cx - 50, top: cy - 50, radius: 50, fill: '#FBBF24' })
      const eyeL = new fabric.Circle({ left: cx - 28, top: cy - 22, radius: 6, fill: '#1F2937' })
      const eyeR = new fabric.Circle({ left: cx + 16, top: cy - 22, radius: 6, fill: '#1F2937' })
      const smile = new fabric.Path('M 25 55 Q 50 78 75 55', {
        left: cx - 50,
        top: cy - 50,
        fill: '',
        stroke: '#1F2937',
        strokeWidth: 4,
      })
      const group = new fabric.Group([face, eyeL, eyeR, smile])
      c.add(group)
      c.setActiveObject(group)
      c.requestRenderAll()
    },
  },
  {
    id: 'sticker-sale',
    label: 'Sale tag',
    category: 'stickers',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M 10 10 L 70 10 L 90 30 L 90 90 L 10 90 Z M 70 10 L 70 30 L 90 30',
        { left: cx - 50, top: cy - 50, fill: '#DC2626' }
      ),
  },
  {
    id: 'sticker-new',
    label: 'New badge',
    category: 'stickers',
    add: (c, cx, cy) => addShapeRect(c, cx, cy, 120, 48, '#059669', 24),
  },
  {
    id: 'sticker-fire',
    label: 'Hot',
    category: 'stickers',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M 50 5 C 60 25 75 30 70 50 C 85 45 90 65 80 80 C 70 95 50 98 35 85 C 15 70 20 45 35 30 C 40 20 45 10 50 5 Z',
        { left: cx - 45, top: cy - 50, fill: '#F97316' }
      ),
  },
  {
    id: 'sticker-thumbs',
    label: 'Thumbs up',
    category: 'stickers',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M 20 45 L 20 85 L 45 85 L 45 45 L 35 25 L 30 25 L 25 35 Z M 50 50 L 75 20 L 85 25 L 70 50 L 85 55 L 50 85 L 50 50 Z',
        { left: cx - 45, top: cy - 45, fill: '#3B8FD6' }
      ),
  },
  {
    id: 'sticker-star-badge',
    label: 'Star badge',
    category: 'stickers',
    add: (c, cx, cy) => {
      const bg = new fabric.Circle({ left: cx - 48, top: cy - 48, radius: 48, fill: '#8b3dff' })
      const star = new fabric.Path(
        'M 50 15 L 58 38 L 82 38 L 63 52 L 71 75 L 50 60 L 29 75 L 37 52 L 18 38 L 42 38 Z',
        { left: cx - 50, top: cy - 50, fill: '#FFFFFF', scaleX: 0.9, scaleY: 0.9 }
      )
      const group = new fabric.Group([bg, star])
      c.add(group)
      c.setActiveObject(group)
      c.requestRenderAll()
    },
  },
]

/** @deprecated use ElementCategory — kept for parity-tools-panel compat */
export type LegacyElementCategory = 'shapes' | 'icons' | 'frames'

export function getElementsByCategory(category: ElementCategory): ElementDef[] {
  return ELEMENTS.filter((el) => el.category === category)
}

export function findElement(id: string): ElementDef | undefined {
  return ELEMENTS.find((el) => el.id === id)
}

export function addElementById(
  canvas: fabric.Canvas,
  id: string,
  cx: number,
  cy: number
): boolean {
  const el = findElement(id)
  if (!el) return false
  el.add(canvas, cx, cy)
  return true
}

export async function addQrCode(
  canvas: fabric.Canvas,
  data: string,
  cx: number,
  cy: number
): Promise<void> {
  const encoded = encodeURIComponent(data.slice(0, 500) || 'https://indobase.in')
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encoded}&margin=8`
  const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
  img.set({ left: cx - 80, top: cy - 80, scaleX: 160 / 256, scaleY: 160 / 256 })
  ;(img as fabric.FabricObject & { _indobaseKind?: string })._indobaseKind = 'qr'
  canvas.add(img)
  canvas.setActiveObject(img)
  canvas.requestRenderAll()
}

export function addBarChart(
  canvas: fabric.Canvas,
  values: number[],
  labels: string[],
  left: number,
  top: number
): void {
  const max = Math.max(...values, 1)
  const barW = 48
  const gap = 16
  const chartH = 200
  const objs: fabric.FabricObject[] = []

  values.forEach((v, i) => {
    const h = Math.max(4, (v / max) * chartH)
    const x = left + i * (barW + gap)
    const bar = new fabric.Rect({
      left: x,
      top: top + chartH - h,
      width: barW,
      height: h,
      fill: ['#3B8FD6', '#F5A524', '#E8618C', '#059669'][i % 4],
      rx: 4,
      ry: 4,
    })
    const label = new fabric.Textbox(labels[i] || `Item ${i + 1}`, {
      left: x - 4,
      top: top + chartH + 8,
      width: barW + 8,
      fontSize: 14,
      fill: '#64748B',
      textAlign: 'center',
      fontFamily: 'Inter',
    })
    objs.push(bar, label)
  })

  objs.forEach((o) => canvas.add(o))
  canvas.requestRenderAll()
}

export function addPieChart(
  canvas: fabric.Canvas,
  values: number[],
  cx: number,
  cy: number,
  radius = 90
): void {
  const total = values.reduce((a, b) => a + b, 0) || 1
  let angle = -Math.PI / 2
  const colors = ['#3B8FD6', '#F5A524', '#E8618C', '#059669', '#7C3AED']

  values.forEach((v, i) => {
    const sweep = (v / total) * Math.PI * 2
    const x1 = cx + radius * Math.cos(angle)
    const y1 = cy + radius * Math.sin(angle)
    const x2 = cx + radius * Math.cos(angle + sweep)
    const y2 = cy + radius * Math.sin(angle + sweep)
    const large = sweep > Math.PI ? 1 : 0
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`
    const wedge = new fabric.Path(d, {
      fill: colors[i % colors.length],
      strokeWidth: 0,
    })
    canvas.add(wedge)
    angle += sweep
  })
  canvas.requestRenderAll()
}
