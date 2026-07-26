/**
 * Studio-owned OpenRouter routing for Indobase Design (do not import Builder).
 * Returns Fabric.js canvas JSON the Design editor can load as editable objects.
 */
export const DESIGN_OPENROUTER_PLANNING_MODEL = 'openai/gpt-oss-120b'
export const DESIGN_OPENROUTER_FALLBACK_MODEL = 'qwen/qwen3.5-flash-02-23'

export type DesignGenerateInput = {
  prompt: string
  width?: number
  height?: number
  category?: string
}

export type DesignGenerateResult = {
  name: string
  width: number
  height: number
  canvas: {
    version: string
    background: string
    objects: Record<string, unknown>[]
  }
  model: string
}

function resolveOpenRouterApiKey(): string {
  return (
    process.env.OPEN_ROUTER_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    ''
  )
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('Model did not return JSON')
  }
}

async function callOpenRouter(opts: {
  model: string
  system: string
  user: string
}): Promise<string> {
  const apiKey = resolveOpenRouterApiKey()
  if (!apiKey) {
    throw Object.assign(new Error('OpenRouter is not configured on Studio'), { status: 503 })
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://studio.indobase.in',
      'X-Title': 'Indobase Design',
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.55,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw Object.assign(
      new Error(`OpenRouter error ${res.status}: ${body.slice(0, 240) || res.statusText}`),
      { status: 502 }
    )
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty OpenRouter response')
  return content
}

function normalizeObject(raw: Record<string, unknown>, width: number, height: number) {
  const type = String(raw.type || 'Textbox')
  const base: Record<string, unknown> = {
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    opacity: typeof raw.opacity === 'number' ? raw.opacity : 1,
    strokeWidth: typeof raw.strokeWidth === 'number' ? raw.strokeWidth : 0,
    left: Math.max(0, Math.min(width - 20, Number(raw.left) || 40)),
    top: Math.max(0, Math.min(height - 20, Number(raw.top) || 40)),
    ...raw,
    type,
  }

  if (type === 'Textbox' || type === 'textbox' || type === 'IText' || type === 'Text') {
    base.type = 'Textbox'
    base.text = String(raw.text || 'Text').slice(0, 280)
    base.fontSize = Math.min(160, Math.max(14, Number(raw.fontSize) || 36))
    base.fontFamily = String(raw.fontFamily || 'Montserrat')
    base.fontWeight = raw.fontWeight ?? 700
    base.fill = String(raw.fill || '#111827')
    base.width = Math.min(width - 40, Math.max(80, Number(raw.width) || width * 0.8))
    base.textAlign = String(raw.textAlign || 'left')
  } else if (type === 'Rect' || type === 'rect') {
    base.type = 'Rect'
    base.width = Math.min(width, Math.max(20, Number(raw.width) || 200))
    base.height = Math.min(height, Math.max(8, Number(raw.height) || 80))
    base.fill = String(raw.fill || '#3B8FD6')
    base.rx = Number(raw.rx) || 0
    base.ry = Number(raw.ry) || base.rx
  } else if (type === 'Circle' || type === 'circle') {
    base.type = 'Circle'
    base.radius = Math.min(Math.min(width, height) / 2, Math.max(10, Number(raw.radius) || 80))
    base.fill = String(raw.fill || '#F5A524')
  } else {
    // Unknown types become a text label so the canvas always stays editable.
    base.type = 'Textbox'
    base.text = String(raw.text || type).slice(0, 80)
    base.fontSize = 28
    base.fill = '#111827'
    base.width = Math.min(width - 40, 400)
  }

  return base
}

function fallbackCanvas(prompt: string, width: number, height: number): DesignGenerateResult['canvas'] {
  return {
    version: '6.0.0',
    background: '#0B1220',
    objects: [
      {
        type: 'Rect',
        version: '6.0.0',
        left: 0,
        top: 0,
        width,
        height: Math.round(height * 0.35),
        fill: '#3B8FD6',
        opacity: 0.25,
        originX: 'left',
        originY: 'top',
        strokeWidth: 0,
      },
      {
        type: 'Textbox',
        version: '6.0.0',
        text: 'Indobase Design draft',
        left: 60,
        top: Math.round(height * 0.28),
        width: width - 120,
        fontSize: 48,
        fontFamily: 'Montserrat',
        fontWeight: 800,
        fill: '#FFFFFF',
        originX: 'left',
        originY: 'top',
        strokeWidth: 0,
      },
      {
        type: 'Textbox',
        version: '6.0.0',
        text: prompt.slice(0, 160),
        left: 60,
        top: Math.round(height * 0.42),
        width: width - 120,
        fontSize: 28,
        fontFamily: 'Inter',
        fontWeight: 400,
        fill: '#CBD5E1',
        originX: 'left',
        originY: 'top',
        strokeWidth: 0,
      },
    ],
  }
}

export async function generateDesignDraft(
  input: DesignGenerateInput
): Promise<DesignGenerateResult> {
  const prompt = String(input.prompt || '').trim()
  if (prompt.length < 3) {
    throw Object.assign(new Error('Prompt is required'), { status: 400 })
  }

  const width = Math.min(2400, Math.max(400, Number(input.width) || 1080))
  const height = Math.min(2400, Math.max(400, Number(input.height) || 1080))
  const category = String(input.category || 'social').slice(0, 40)

  const system = `You are Indobase Design's layout drafter.
Return ONLY JSON with shape:
{"name":"string","background":"#hex","objects":[...]}
Each object is Fabric.js-like with type Rect|Circle|Textbox and fields:
left, top, width, height, radius, fill, text, fontSize, fontFamily, fontWeight, textAlign, opacity, rx.
Rules:
- Prefer 4–10 objects that fit a ${width}x${height} canvas
- India-first marketing tone when relevant (festivals, WhatsApp, GST-friendly pricing)
- Use Montserrat for headlines and Inter for body
- Indobase brand accents when colors are unspecified: #3B8FD6, #F5A524, #E8618C
- You may include merge placeholders like {{product_name}} or {{price}} in text when useful
- No markdown, no code fences, no images`

  const user = `Category: ${category}
Canvas: ${width}x${height}
Brief: ${prompt}`

  let model = DESIGN_OPENROUTER_PLANNING_MODEL
  let content: string
  try {
    content = await callOpenRouter({ model, system, user })
  } catch (err) {
    try {
      model = DESIGN_OPENROUTER_FALLBACK_MODEL
      content = await callOpenRouter({ model, system, user })
    } catch {
      return {
        name: prompt.slice(0, 60) || 'AI draft',
        width,
        height,
        canvas: fallbackCanvas(prompt, width, height),
        model: 'fallback-local',
      }
    }
  }

  const parsed = extractJsonObject(content) as {
    name?: string
    background?: string
    objects?: Record<string, unknown>[]
  }

  const objects = Array.isArray(parsed.objects)
    ? parsed.objects
        .filter((o) => o && typeof o === 'object')
        .slice(0, 24)
        .map((o) => normalizeObject(o, width, height))
    : []

  if (!objects.length) {
    return {
      name: String(parsed.name || prompt).slice(0, 80) || 'AI draft',
      width,
      height,
      canvas: fallbackCanvas(prompt, width, height),
      model,
    }
  }

  return {
    name: String(parsed.name || prompt).slice(0, 80) || 'AI draft',
    width,
    height,
    canvas: {
      version: '6.0.0',
      background: String(parsed.background || '#FFFFFF').slice(0, 64),
      objects,
    },
    model,
  }
}
