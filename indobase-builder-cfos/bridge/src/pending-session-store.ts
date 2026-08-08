/**
 * After agent-side OTP verify, hold a signed session until the browser claims it
 * (workerd fetch cannot Set-Cookie on the operator's browser).
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export type PendingSessionRecord = {
  username: string
  sessionToken: string
  email: string
  projectRef: string
  createdAt: string
  expiresAt: string
}

type StoreFile = {
  version: 1
  pending: Record<string, PendingSessionRecord>
}

const TTL_MS = 15 * 60 * 1000

function storePath(): string {
  const root =
    process.env.INDOBASE_AGENT_PRINCIPAL_DIR?.trim() ||
    process.env.INDOBASE_LAUNCH_ROOT?.trim() ||
    path.join(process.cwd(), '.indobase-launches')
  return path.join(root, 'pending-sessions.json')
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as StoreFile
    if (!parsed || parsed.version !== 1 || typeof parsed.pending !== 'object') {
      return { version: 1, pending: {} }
    }
    return parsed
  } catch {
    return { version: 1, pending: {} }
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  const file = storePath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

function prune(store: StoreFile, now = Date.now()): StoreFile {
  const pending: Record<string, PendingSessionRecord> = {}
  for (const [k, v] of Object.entries(store.pending)) {
    if (v && Date.parse(v.expiresAt) > now) pending[k] = v
  }
  return { version: 1, pending }
}

export async function rememberPendingSession(input: {
  username: string
  sessionToken: string
  email: string
  projectRef: string
}): Promise<void> {
  const username = input.username.trim()
  if (!username || !input.sessionToken) return
  const now = Date.now()
  const store = prune(await readStore(), now)
  store.pending[username] = {
    username,
    sessionToken: input.sessionToken,
    email: input.email,
    projectRef: input.projectRef,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  }
  await writeStore(store)
}

export async function takePendingSession(
  username: string,
): Promise<PendingSessionRecord | null> {
  const key = username.trim()
  if (!key) return null
  const now = Date.now()
  const store = prune(await readStore(), now)
  const found = store.pending[key] || null
  if (!found) return null
  delete store.pending[key]
  await writeStore(store)
  return found
}
