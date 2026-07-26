/**
 * Elements library — MIT-friendly inline SVG icons + shape presets.
 * Icons are simple path drawings rendered as Fabric Path / Group.
 */
import * as fabric from 'fabric'

export type ElementDef = {
  id: string
  label: string
  category: 'shapes' | 'icons' | 'frames'
  add: (canvas: fabric.Canvas, cx: number, cy: number) => void
}

function addPath(canvas: fabric.Canvas, path: string, opts: Record<string, unknown>) {
  const p = new fabric.Path(path, {
    fill: '#6366f1',
    strokeWidth: 0,
    ...opts,
  })
  canvas.add(p)
  canvas.setActiveObject(p)
  canvas.requestRenderAll()
}

export const ELEMENTS: ElementDef[] = [
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
    id: 'check',
    label: 'Check',
    category: 'icons',
    add: (c, cx, cy) =>
      addPath(c, 'M 12 50 L 38 76 L 88 20 L 76 10 L 38 54 L 24 40 Z', {
        left: cx - 45,
        top: cy - 40,
        fill: '#059669',
      }),
  },
  {
    id: 'star-outline',
    label: 'Burst',
    category: 'icons',
    add: (c, cx, cy) =>
      addPath(
        c,
        'M50 0 L58 35 L95 28 L68 55 L85 90 L50 70 L15 90 L32 55 L5 28 L42 35 Z',
        { left: cx - 48, top: cy - 48, fill: '#F5A524' }
      ),
  },
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
]

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
