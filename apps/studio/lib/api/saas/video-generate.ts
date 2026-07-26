/**
 * Studio-owned OpenRouter routing for Indobase Video (do not import Builder).
 * Model choices mirror indobase-builder openrouter-model-policy for planning/codegen.
 */

export const VIDEO_OPENROUTER_PLANNING_MODEL = 'openai/gpt-oss-120b'
export const VIDEO_OPENROUTER_FALLBACK_MODEL = 'qwen/qwen3.5-flash-02-23'

export type VideoSceneDraft = {
  title: string
  narration: string
  textOverlay: string
  durationSec: number
}

export type VideoGenerateInput = {
  prompt: string
  durationTargetSec?: number
  aspect?: '16:9' | '9:16' | '1:1'
}

export type VideoGenerateResult = {
  title: string
  aspect: '16:9' | '9:16' | '1:1'
  scenes: VideoSceneDraft[]
  model: string
}

function resolveOpenRouterApiKey(): string {
  return (
    process.env.OPEN_ROUTER_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    ''
  )
}

function canvasForAspect(aspect: VideoGenerateInput['aspect']) {
  if (aspect === '9:16') return { width: 720, height: 1280 }
  if (aspect === '1:1') return { width: 1080, height: 1080 }
  return { width: 1280, height: 720 }
}

export { canvasForAspect }

function clampScenes(
  scenes: VideoSceneDraft[],
  durationTargetSec: number
): VideoSceneDraft[] {
  const cleaned = scenes
    .map((s) => ({
      title: String(s.title || 'Scene').slice(0, 80),
      narration: String(s.narration || '').slice(0, 600),
      textOverlay: String(s.textOverlay || s.title || '').slice(0, 120),
      durationSec: Math.min(20, Math.max(2, Number(s.durationSec) || 4)),
    }))
    .filter((s) => s.narration || s.textOverlay)
    .slice(0, 12)

  if (!cleaned.length) {
    return [
      {
        title: 'Intro',
        narration: 'Welcome to your Indobase Video draft.',
        textOverlay: 'Your story starts here',
        durationSec: Math.min(8, Math.max(4, durationTargetSec)),
      },
    ]
  }

  const total = cleaned.reduce((n, s) => n + s.durationSec, 0)
  if (total <= 0) return cleaned
  const scale = durationTargetSec / total
  if (Math.abs(scale - 1) < 0.15) return cleaned
  return cleaned.map((s) => ({
    ...s,
    durationSec: Math.min(20, Math.max(2, Math.round(s.durationSec * scale * 10) / 10)),
  }))
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
      'X-Title': 'Indobase Video',
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.6,
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

export async function generateVideoStoryboard(
  input: VideoGenerateInput
): Promise<VideoGenerateResult> {
  const prompt = String(input.prompt || '').trim()
  if (prompt.length < 3) {
    throw Object.assign(new Error('Prompt is required'), { status: 400 })
  }

  const durationTargetSec = Math.min(
    90,
    Math.max(8, Number(input.durationTargetSec) || 30)
  )
  const aspect = input.aspect === '9:16' || input.aspect === '1:1' ? input.aspect : '16:9'

  const system = `You are Indobase Video's storyboard writer.
Return ONLY JSON with shape:
{"title":"string","scenes":[{"title":"string","narration":"spoken voiceover","textOverlay":"on-screen title","durationSec":number}]}
Rules:
- 3 to 8 scenes totaling about ${durationTargetSec} seconds
- narration is natural spoken English (or the user's language)
- textOverlay is short (max ~8 words)
- durationSec between 2 and 12
- no markdown, no code fences`

  const user = `Aspect: ${aspect}
Target duration: ${durationTargetSec}s
Brief: ${prompt}`

  let model = VIDEO_OPENROUTER_PLANNING_MODEL
  let content: string
  try {
    content = await callOpenRouter({ model, system, user })
  } catch (err) {
    model = VIDEO_OPENROUTER_FALLBACK_MODEL
    content = await callOpenRouter({ model, system, user })
  }

  const parsed = extractJsonObject(content) as {
    title?: string
    scenes?: VideoSceneDraft[]
  }

  const scenes = clampScenes(Array.isArray(parsed.scenes) ? parsed.scenes : [], durationTargetSec)

  return {
    title: String(parsed.title || 'AI draft').slice(0, 120),
    aspect,
    scenes,
    model,
  }
}
