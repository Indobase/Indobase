#!/usr/bin/env node
/**
 * Seed Indobase Builder CFOS (local Cloudflare OS) with OpenRouter models and run a smoke test.
 *
 * Usage:
 *   node scripts/seed-openrouter-models.mjs --key-file /tmp/indobase-openrouter.key
 *   OPEN_ROUTER_API_KEY=sk-or-… node scripts/seed-openrouter-models.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OS = process.env.CLOUDFLARE_OS_DIR || join(ROOT, 'upstream/cloudflare-os')
const FE = join(OS, 'packages/workshop-frontend')
const CFOS_URL = (process.env.CLOUDFLARE_OS_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const WS_URL = CFOS_URL.replace(/^http/, 'ws') + '/api'

// Resolve deps from the frontend package (where they are installed).
const requireFe = createRequire(join(FE, 'package.json'))

// Same salt as packages/workshop-shared/src/api.ts SERVICE_SALT
const SERVICE_SALT = new Uint8Array([
  0xd9, 0x4e, 0x54, 0x1d, 0x29, 0xc1, 0x03, 0x74, 0x73, 0x7e, 0xb3, 0xe3, 0x34, 0x6d, 0x8f, 0x21,
])

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function resolveApiKey() {
  const fromFile = argValue('--key-file')
  if (fromFile) return readFileSync(fromFile, 'utf8').trim()
  return (
    process.env.OPEN_ROUTER_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    ''
  )
}

async function hashPassword(username, password) {
  const { argon2id } = await import(pathToFileURL(requireFe.resolve('hash-wasm')).href)
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

async function connectRpc() {
  const { newWebSocketRpcSession } = await import(pathToFileURL(requireFe.resolve('capnweb')).href)
  return newWebSocketRpcSession(WS_URL)
}

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
]

async function main() {
  const apiKey = resolveApiKey()
  if (!apiKey) {
    console.error('Missing OPEN_ROUTER_API_KEY / OPENROUTER_API_KEY (or --key-file)')
    process.exit(1)
  }
  console.log(`CF OS: ${CFOS_URL}`)
  console.log(`OpenRouter key: set len=${apiKey.length} prefix=${apiKey.slice(0, 10)}…`)

  const username = process.env.VITE_DEV_USERNAME || 'dev'
  const password = process.env.VITE_DEV_PASSWORD || 'devpassword'

  const api = await connectRpc()
  const passwordHash = await hashPassword(username, password)

  let token = await api.createAccount(username, username, passwordHash)
  if (!token) token = await api.login(username, passwordHash)
  if (!token) throw new Error('Failed to create/login local CF OS account')
  console.log(`Logged in as ${username}`)

  const auth = await api.authenticate(token)

  const existing = await auth.listModels()
  console.log(
    `Existing models: ${existing.length ? existing.map((m) => m.id).join(', ') : '(none)'}`,
  )

  let preferredId = null
  let quickId = null

  for (const model of MODELS) {
    const already = existing.some((m) => m.id === model.id)
    if (already) {
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
    console.log(`${already ? 'Updated' : 'Added'} model ${model.id}`)
    if (model.preferred) preferredId = model.id
    if (model.quick) quickId = model.id
  }

  if (preferredId) {
    await auth.setPreferredModel(preferredId)
    console.log(`Preferred (agent) model → ${preferredId}`)
  }
  if (quickId) {
    await auth.setQuickModel(quickId)
    console.log(`Quick model → ${quickId}`)
  }
  if (!(await auth.isOnboardingCompleted())) {
    await auth.completeOnboarding()
    console.log('Onboarding marked complete')
  }

  const testModelId = preferredId || MODELS[0].id
  console.log(`Test run via LanguageModelBinding.run (${testModelId})…`)
  const overseer = await auth.newGadget()
  const gk = await overseer.newAiModelGatekeeper(testModelId)
  const session = await gk.openSession()
  const reply = await session.run({
    prompt: 'Reply with exactly the three characters: OK.',
    systemPrompt: 'You are a terse test harness. Do not add punctuation or explanation.',
  })
  console.log('Model reply:', JSON.stringify(String(reply).slice(0, 300)))

  const models = await auth.listModels()
  console.log('Configured models:', models.map((m) => `${m.name} [${m.id}]`).join(' | '))
  console.log('Done.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
