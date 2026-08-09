/**
 * Ensure the current CFOS principal has OpenRouter models (Luna/Terra).
 * Uses Cap'n Web against CLOUDFLARE_OS_URL — same path as scripts/seed-openrouter-models.mjs.
 */
import { createHash } from 'node:crypto'

import { newWebSocketRpcSession } from 'capnweb'
import { argon2id } from 'hash-wasm'

const SERVICE_SALT = new Uint8Array([
  0xd9, 0x4e, 0x54, 0x1d, 0x29, 0xc1, 0x03, 0x74, 0x73, 0x7e, 0xb3, 0xe3, 0x34, 0x6d, 0x8f, 0x21,
])

const MODELS = [
  {
    id: 'openai/gpt-5.6-luna',
    name: 'GPT 5.6 Luna (OpenRouter)',
    preferred: true,
    quick: false,
  },
  {
    id: 'openai/gpt-5.6-terra',
    name: 'GPT 5.6 Terra (OpenRouter)',
    preferred: false,
    quick: true,
  },
] as const

function resolveOpenRouterKey(): string {
  return (
    process.env.OPEN_ROUTER_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    ''
  )
}

function resolveCfosUrl(): string {
  return (process.env.CLOUDFLARE_OS_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '')
}

async function hashPassword(username: string, password: string): Promise<Uint8Array> {
  const usernameBuf = new TextEncoder().encode(username)
  const salt = new Uint8Array(SERVICE_SALT.length + usernameBuf.length)
  salt.set(SERVICE_SALT)
  salt.set(usernameBuf, SERVICE_SALT.length)
  return argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'binary',
  })
}

type AuthApi = {
  listModels: () => Promise<Array<{ id: string }>>
  deleteModel: (id: string) => Promise<void>
  addModel: (
    meta: { type: string; id: string; name: string },
    config: { provider: string; model: string; apiToken: string; apiUrl: string },
  ) => Promise<void>
  setPreferredModel: (id: string) => Promise<void>
  setQuickModel: (id: string) => Promise<void>
  isOnboardingCompleted: () => Promise<boolean>
  completeOnboarding: () => Promise<void>
}

type PublicApi = {
  createAccount: (u: string, display: string, hash: Uint8Array) => Promise<string | null>
  login: (u: string, hash: Uint8Array) => Promise<string | null>
  authenticate: (token: string) => Promise<AuthApi>
}

export function openRouterKeyConfigured(): boolean {
  return resolveOpenRouterKey().length >= 20
}

export async function ensureAgentModels(input: {
  username: string
  password: string
}): Promise<{ ok: boolean; message?: string }> {
  const apiKey = resolveOpenRouterKey()
  if (!apiKey || apiKey.length < 20) {
    return { ok: false, message: 'OPEN_ROUTER_API_KEY missing' }
  }

  const cfosUrl = resolveCfosUrl()
  const wsUrl = cfosUrl.replace(/^http/, 'ws') + '/api'

  try {
    const api = newWebSocketRpcSession(wsUrl) as unknown as PublicApi
    const passwordHash = await hashPassword(input.username, input.password)
    let token = await api.createAccount(input.username, input.username, passwordHash)
    if (!token) token = await api.login(input.username, passwordHash)
    if (!token) return { ok: false, message: 'CFOS login failed' }

    const auth = await api.authenticate(token)
    const existing = await auth.listModels()

    let preferredId: string | null = null
    let quickId: string | null = null

    for (const model of MODELS) {
      if (existing.some((m) => m.id === model.id)) {
        await auth.deleteModel(model.id)
      }
      await auth.addModel(
        { type: 'agent', id: model.id, name: model.name },
        {
          provider: 'openai',
          model: model.id,
          apiToken: apiKey,
          apiUrl: 'https://openrouter.ai/api/v1',
        },
      )
      if (model.preferred) preferredId = model.id
      if (model.quick) quickId = model.id
    }

    if (preferredId) await auth.setPreferredModel(preferredId)
    if (quickId) await auth.setQuickModel(quickId)
    if (!(await auth.isOnboardingCompleted())) await auth.completeOnboarding()

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[ensure-agent-models] ${input.username}: ${message}`)
    return { ok: false, message }
  }
}

/** Fire-and-forget wrapper for credentials endpoint. */
export function ensureAgentModelsAsync(input: { username: string; password: string }): void {
  if (!openRouterKeyConfigured()) {
    console.warn('[ensure-agent-models] OPEN_ROUTER_API_KEY missing — chat will not generate')
    return
  }
  void ensureAgentModels(input).then((r) => {
    if (r.ok) console.log(`[ensure-agent-models] ok user=${input.username}`)
    else console.warn(`[ensure-agent-models] failed user=${input.username} ${r.message || ''}`)
  })
}

/** Deterministic fingerprint for logs (not for auth). */
export function usernameFingerprint(username: string): string {
  return createHash('sha256').update(username).digest('hex').slice(0, 8)
}
