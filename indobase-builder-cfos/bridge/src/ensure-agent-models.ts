/**
 * Ensure the current CFOS principal has the approved OpenRouter model pool
 * (code / org / chat) and purge anything else (e.g. leftover gpt-3.5-turbo).
 * Uses Cap'n Web against CLOUDFLARE_OS_URL — same path as scripts/seed-openrouter-models.mjs.
 */
import { createHash } from 'node:crypto'

import { newWebSocketRpcSession } from 'capnweb'
import { argon2id } from 'hash-wasm'

import {
  CFOS_APPROVED_MODELS,
  isApprovedCfosModelId,
  preferredCfosModelId,
  quickCfosModelId,
} from './cfos-model-policy.js'

const SERVICE_SALT = new Uint8Array([
  0xd9, 0x4e, 0x54, 0x1d, 0x29, 0xc1, 0x03, 0x74, 0x73, 0x7e, 0xb3, 0xe3, 0x34, 0x6d, 0x8f, 0x21,
])

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
  /** Human label — never seed CFOS profile as ib_*. */
  displayName?: string
}): Promise<{ ok: boolean; message?: string; purged?: string[]; seeded?: string[] }> {
  const apiKey = resolveOpenRouterKey()
  if (!apiKey || apiKey.length < 20) {
    return { ok: false, message: 'OPEN_ROUTER_API_KEY missing' }
  }

  const cfosUrl = resolveCfosUrl()
  const wsUrl = cfosUrl.replace(/^http/, 'ws') + '/api'
  const rawLabel = typeof input.displayName === 'string' ? input.displayName.trim() : ''
  const accountLabel =
    rawLabel && !rawLabel.startsWith('ib_') ? rawLabel : 'Indobase operator'

  try {
    const api = newWebSocketRpcSession(wsUrl) as unknown as PublicApi
    const passwordHash = await hashPassword(input.username, input.password)
    let token = await api.createAccount(input.username, accountLabel, passwordHash)
    if (!token) token = await api.login(input.username, passwordHash)
    if (!token) return { ok: false, message: 'CFOS login failed' }

    const auth = await api.authenticate(token)
    const existing = await auth.listModels()
    const purged: string[] = []

    // Remove junk / legacy models (gpt-3.5-turbo, free-tier leftovers, etc.)
    for (const m of existing) {
      if (!isApprovedCfosModelId(m.id)) {
        try {
          await auth.deleteModel(m.id)
          purged.push(m.id)
        } catch (err) {
          console.warn(
            `[ensure-agent-models] purge failed ${m.id}:`,
            err instanceof Error ? err.message : err,
          )
        }
      }
    }

    const seeded: string[] = []
    for (const model of CFOS_APPROVED_MODELS) {
      const stillThere = (await auth.listModels()).some((m) => m.id === model.id)
      if (stillThere) {
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
      seeded.push(model.id)
    }

    await auth.setPreferredModel(preferredCfosModelId())
    await auth.setQuickModel(quickCfosModelId())
    if (!(await auth.isOnboardingCompleted())) await auth.completeOnboarding()

    if (purged.length) {
      console.log(
        `[ensure-agent-models] purged non-approved for ${input.username}: ${purged.join(', ')}`,
      )
    }

    return { ok: true, purged, seeded }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[ensure-agent-models] ${input.username}: ${message}`)
    return { ok: false, message }
  }
}

/** Fire-and-forget wrapper for credentials endpoint. */
export function ensureAgentModelsAsync(input: {
  username: string
  password: string
  displayName?: string
}): void {
  if (!openRouterKeyConfigured()) {
    console.warn('[ensure-agent-models] OPEN_ROUTER_API_KEY missing — chat will not generate')
    return
  }
  void ensureAgentModels(input).then((r) => {
    if (r.ok) console.log(`[ensure-agent-models] ok user=${input.username}`)
    else console.warn(`[ensure-agent-models] failed user=${input.username} ${r.message || ''}`)
  })
}

/**
 * Await model seed with a timeout so the first chat turn does not race an empty/junk pool.
 * Returns modelsReady=false on timeout/failure (caller may still proceed; preferred is Luna).
 */
export async function ensureAgentModelsWithTimeout(
  input: {
    username: string
    password: string
    displayName?: string
  },
  timeoutMs = 12_000,
): Promise<{ ok: boolean; modelsReady: boolean; message?: string; purged?: string[] }> {
  if (!openRouterKeyConfigured()) {
    return { ok: false, modelsReady: false, message: 'OPEN_ROUTER_API_KEY missing' }
  }
  try {
    const result = await Promise.race([
      ensureAgentModels(input),
      new Promise<{ ok: false; message: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, message: 'ensureAgentModels timeout' }), timeoutMs),
      ),
    ])
    if (result.ok) {
      return {
        ok: true,
        modelsReady: true,
        purged: 'purged' in result ? result.purged : undefined,
      }
    }
    return {
      ok: false,
      modelsReady: false,
      message: result.message,
    }
  } catch (err) {
    return {
      ok: false,
      modelsReady: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Deterministic fingerprint for logs (not for auth). */
export function usernameFingerprint(username: string): string {
  return createHash('sha256').update(username).digest('hex').slice(0, 8)
}
