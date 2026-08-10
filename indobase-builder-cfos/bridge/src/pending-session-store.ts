/**
 * After agent-side OTP verify, hold a signed session until the browser claims it
 * (workerd fetch cannot Set-Cookie on the operator's browser).
 */
import fs from 'node:fs/promises'
import path from 'node:path'

/** Alias so claim-session works even when CFOS agent username ≠ cookie-derived ib_* . */
export const BROWSER_PENDING_CLAIM_KEY = '__browser_claim__'

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
  const record: PendingSessionRecord = {
    username,
    sessionToken: input.sessionToken,
    email: input.email,
    projectRef: input.projectRef,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  }
  store.pending[username] = record
  // Always mirror under the browser claim alias (agent username may be `dev` / drifted).
  store.pending[BROWSER_PENDING_CLAIM_KEY] = { ...record, username: BROWSER_PENDING_CLAIM_KEY }
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
  // Drop every alias that points at the same token (agent username + browser claim).
  for (const [k, v] of Object.entries(store.pending)) {
    if (v && v.sessionToken === found.sessionToken) delete store.pending[k]
  }
  await writeStore(store)
  return found
}

/** Try several usernames then the browser alias (for claim-session). */
export async function takePendingSessionForClaim(
  usernames: string[],
): Promise<PendingSessionRecord | null> {
  const tried = new Set<string>()
  for (const raw of [...usernames, BROWSER_PENDING_CLAIM_KEY]) {
    const key = raw.trim()
    if (!key || tried.has(key)) continue
    tried.add(key)
    const found = await takePendingSession(key)
    if (found) return found
  }
  return null
}
