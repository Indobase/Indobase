/**
 * Text-to-speech for Indobase Video narration.
 * Prefer ElevenLabs when configured; else OpenAI TTS; else unavailable.
 */

export type VideoTtsResult =
  | {
      available: true
      provider: 'elevenlabs' | 'openai'
      mime: string
      extension: 'mp3' | 'wav'
      audioBase64: string
    }
  | {
      available: false
      message: string
    }

function resolveElevenLabsKey(): string {
  return (
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.ELEVENSLABS_API_KEY?.trim() ||
    process.env.ELEVEN_LABS_API_KEY?.trim() ||
    ''
  )
}

function resolveOpenAiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() || ''
}

export function isVideoTtsConfigured(): boolean {
  return Boolean(resolveElevenLabsKey() || resolveOpenAiKey())
}

export async function synthesizeVideoNarration(opts: {
  text: string
  voice?: string
}): Promise<VideoTtsResult> {
  const text = String(opts.text || '').trim()
  if (!text) {
    throw Object.assign(new Error('text is required'), { status: 400 })
  }
  if (text.length > 2500) {
    throw Object.assign(new Error('text too long (max 2500 chars)'), { status: 400 })
  }

  const elevenKey = resolveElevenLabsKey()
  if (elevenKey) {
    const voice = (opts.voice || process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMbwVHzRik').trim()
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenKey,
        },
        body: JSON.stringify({
          text,
          model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
        }),
      }
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw Object.assign(
        new Error(`ElevenLabs TTS failed (${res.status}): ${body.slice(0, 200)}`),
        { status: 502 }
      )
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return {
      available: true,
      provider: 'elevenlabs',
      mime: 'audio/mpeg',
      extension: 'mp3',
      audioBase64: buf.toString('base64'),
    }
  }

  const openaiKey = resolveOpenAiKey()
  if (openaiKey) {
    const voice = (opts.voice || 'alloy').trim()
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || 'tts-1',
        voice,
        input: text,
        response_format: 'mp3',
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw Object.assign(
        new Error(`OpenAI TTS failed (${res.status}): ${body.slice(0, 200)}`),
        { status: 502 }
      )
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return {
      available: true,
      provider: 'openai',
      mime: 'audio/mpeg',
      extension: 'mp3',
      audioBase64: buf.toString('base64'),
    }
  }

  return {
    available: false,
    message: 'Voice narration unavailable — no ElevenLabs or OpenAI TTS key configured.',
  }
}
