/**
 * Pure Launch capability heuristics — no I/O.
 * Used by business.launch Plan stage / os-launch-planner Studio wrappers.
 */

export type LaunchCapabilityId =
  | 'auth'
  | 'database'
  | 'payments'
  | 'email'
  | 'analytics'
  | 'storage'

export const LAUNCH_CAPABILITY_IDS: readonly LaunchCapabilityId[] = [
  'auth',
  'database',
  'payments',
  'email',
  'analytics',
  'storage',
] as const

export type LaunchPlannerResult = {
  requiredCapabilities: LaunchCapabilityId[]
  /** Customer-safe explanation per capability id. */
  reasons: Record<string, string>
  /** Short readiness notes for Launch / OS UI (no infra jargon). */
  readinessNotes: string[]
}

export type LaunchPlannerSignals = {
  /** Free-text Launch intent (“add login”, “Launch my business”, …). */
  intent?: string
  /** Publish payload (artifacts, sourceFiles, metadata, …). */
  payload?: Record<string, unknown>
  /** saas.projects.auth_config */
  authConfig?: unknown
  /** Recent deployments (metadata may carry package deps / env hints). */
  deployments?: Array<{ metadata?: Record<string, unknown>; status?: string }>
  provisionState?: 'none' | 'provisioning' | 'ready'
  workspaceName?: string
}

const CUSTOMER_REASONS: Record<LaunchCapabilityId, string> = {
  auth: 'Your app includes sign-in or account features.',
  database: 'Your app needs a database to store business data.',
  payments: 'Your app includes checkout or payment features.',
  email: 'Your app sends email (notifications or transactional mail).',
  analytics: 'Your app tracks product analytics or events.',
  storage: 'Your app uploads or serves files from object storage.',
}

/** Soft keywords used only against explicit Launch intent (not code corpus). */
const INTENT_PATTERNS: Record<LaunchCapabilityId, RegExp> = {
  auth: /\b(auth|login|log[\s-]?in|sign[\s-]?in|sign[\s-]?up|better[\s-]?auth|gotrue|accounts?|users?\s+accounts?)\b/i,
  database: /\b(database|postgres|postgresql|db|tables?|backend\s+data|save\s+data)\b/i,
  payments: /\b(payments?|stripe|razorpay|checkout|billing|subscribe|commerce)\b/i,
  email: /\b(email|smtp|resend|sendgrid|mailgun|transactional\s+mail)\b/i,
  analytics: /\b(analytics|posthog|tracking|funnels?|product\s+events?)\b/i,
  storage: /\b(storage|uploads?|file\s+uploads?|object\s+storage|s3|minio)\b/i,
}

/**
 * Stronger patterns for code / package / env corpus.
 * Avoid bare “email” / “analytics” marketing words in HTML landings.
 */
const CORPUS_PATTERNS: Record<LaunchCapabilityId, RegExp> = {
  auth: /(?:^|[^A-Za-z0-9_])(?:better[\s-]?auth|@better-auth|gotrue|supabase\.auth|createClient\s*\([^)]*\)[\s\S]{0,80}\.auth|@indobaseinc\/auth|signInWith|signUpWith|getSession\s*\(|requireAuth|AUTH_JWT|NEXT_PUBLIC_[\w]*AUTH|\/api\/auth|\/auth\/v1|log[\s-]?in\s*form|sign[\s-]?in\s*page)/i,
  database: /(?:^|[^A-Za-z0-9_])(?:postgres(?:ql)?|@indobaseinc\/js|@supabase\/supabase-js|createClient\s*\(|postgrest|\.from\s*\(\s*['"`][\w]+['"`]\s*\)|prisma|drizzle-orm|knex\(|DATABASE_URL|SUPABASE_URL|INDOBASE_URL)/i,
  payments: /(?:^|[^A-Za-z0-9_])(?:stripe|razorpay|@stripe\/|checkout\.sessions|payment_intent|RAZORPAY|STRIPE_SECRET|createCheckout|billing.?portal|commerce)/i,
  email: /(?:^|[^A-Za-z0-9_])(?:resend|sendgrid|nodemailer|mailgun|smtp:\/\/|@react-email|transactional.?email|SENDGRID_|RESEND_API|SMTP_HOST)/i,
  analytics: /(?:^|[^A-Za-z0-9_])(?:posthog|POSTHOG_|mixpanel|plausible\.io|gtag\s*\(|googleanalytics|@indobaseinc\/analytics|capture\s*\(\s*['"`]\$?pageview|analytics\.track)/i,
  storage: /(?:^|[^A-Za-z0-9_])(?:storage\.from\s*\(|supabase\.storage|@indobaseinc\/storage|S3Client|@aws-sdk\/client-s3|minio|multipart.?upload|object.?storage|UPLOAD_BUCKET|STORAGE_BUCKET)/i,
}

const CORPUS_MAX_CHARS = 200_000

function isLaunchCapabilityId(value: string): value is LaunchCapabilityId {
  return (LAUNCH_CAPABILITY_IDS as readonly string[]).includes(value)
}

function normalizeDeclaredCapability(raw: string): LaunchCapabilityId | null {
  const key = raw.trim()
  if (!key) return null
  const aliases: Record<string, LaunchCapabilityId> = {
    auth: 'auth',
    login: 'auth',
    database: 'database',
    db: 'database',
    businessData: 'database',
    businessdata: 'database',
    payments: 'payments',
    commerce: 'payments',
    payment: 'payments',
    email: 'email',
    analytics: 'analytics',
    events: 'analytics',
    storage: 'storage',
  }
  const mapped = aliases[key] ?? aliases[key.toLowerCase()]
  if (mapped) return mapped
  return isLaunchCapabilityId(key) ? key : null
}

/** Collect declared capability ids from auth_config / payload without scanning code. */
export function collectDeclaredCapabilities(
  authConfig: unknown,
  payload?: Record<string, unknown>,
): LaunchCapabilityId[] {
  const out: LaunchCapabilityId[] = []
  const seen = new Set<string>()

  const pushList = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (typeof item !== 'string') continue
      const id = normalizeDeclaredCapability(item)
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }

  if (authConfig && typeof authConfig === 'object' && !Array.isArray(authConfig)) {
    const cfg = authConfig as Record<string, unknown>
    pushList(cfg.required_capabilities)
    pushList(cfg.requiredCapabilities)
    pushList(cfg.capabilities)
    pushList(cfg.os_capabilities)
    if (cfg.os_launch && typeof cfg.os_launch === 'object' && !Array.isArray(cfg.os_launch)) {
      const launch = cfg.os_launch as Record<string, unknown>
      pushList(launch.required_capabilities)
      pushList(launch.requiredCapabilities)
    }
  }

  if (payload) {
    pushList(payload.required_capabilities)
    pushList(payload.requiredCapabilities)
    pushList(payload.capabilities)
  }

  return out
}

function stringifyUnknown(value: unknown, depth = 0): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (depth > 4) return ''
  if (Array.isArray(value)) {
    return value.map((v) => stringifyUnknown(v, depth + 1)).join('\n')
  }
  if (typeof value === 'object') {
    const parts: string[] = []
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      parts.push(k)
      parts.push(stringifyUnknown(v, depth + 1))
    }
    return parts.join('\n')
  }
  return ''
}

function extractFileMap(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof path !== 'string' || !path.trim()) continue
    if (typeof content !== 'string') continue
    out[path.trim()] = content
  }
  return Object.keys(out).length > 0 ? out : null
}

function filesToCorpus(files: Record<string, string> | null): string {
  if (!files) return ''
  const parts: string[] = []
  for (const path of Object.keys(files).sort()) {
    parts.push(path)
    parts.push(files[path] ?? '')
  }
  return parts.join('\n')
}

/** Build a single scan corpus from payload + deployments + auth_config (not intent). */
export function buildLaunchScanCorpus(signals: LaunchPlannerSignals): string {
  const chunks: string[] = []

  const artifacts = extractFileMap(signals.payload?.artifacts ?? signals.payload?.files)
  const sources = extractFileMap(signals.payload?.sourceFiles ?? signals.payload?.source_files)
  chunks.push(filesToCorpus(artifacts))
  chunks.push(filesToCorpus(sources))

  if (signals.payload) {
    const skip = new Set([
      'artifacts',
      'files',
      'sourceFiles',
      'source_files',
      'required_capabilities',
      'requiredCapabilities',
      'gotrue_id',
      'gotrueId',
      'email',
      'workspace_ref',
      'workspaceRef',
    ])
    for (const [key, value] of Object.entries(signals.payload)) {
      if (skip.has(key)) continue
      chunks.push(key)
      chunks.push(stringifyUnknown(value))
    }
  }

  if (signals.authConfig) {
    chunks.push(stringifyUnknown(signals.authConfig))
  }

  for (const dep of signals.deployments ?? []) {
    if (dep.metadata) {
      chunks.push(stringifyUnknown(dep.metadata))
    }
  }

  const joined = chunks.filter(Boolean).join('\n')
  return joined.length > CORPUS_MAX_CHARS ? joined.slice(0, CORPUS_MAX_CHARS) : joined
}

function matchCapability(
  id: LaunchCapabilityId,
  intent: string | undefined,
  corpus: string,
): boolean {
  if (intent?.trim() && INTENT_PATTERNS[id].test(intent)) {
    return true
  }
  if (corpus && CORPUS_PATTERNS[id].test(corpus)) {
    return true
  }
  return false
}

function buildReadinessNotes(input: {
  caps: LaunchCapabilityId[]
  provisionState?: LaunchPlannerSignals['provisionState']
}): string[] {
  const notes: string[] = []
  if (input.caps.length === 0) {
    notes.push(
      'Hosting only — no backend features detected. Your site can go live without extra setup.',
    )
    return notes
  }

  const labels = input.caps.join(', ')
  notes.push(`Launch will enable: ${labels}.`)

  if (input.provisionState === 'ready') {
    notes.push('Your workspace backend is already available for these features.')
  } else if (input.provisionState === 'provisioning') {
    notes.push('Your workspace backend is still being prepared — Launch will wait on required features.')
  } else {
    notes.push('Required features will be set up automatically during Launch.')
  }

  return notes
}

/**
 * Pure planner — deterministic, no I/O.
 * Default landing-only signals → empty requiredCapabilities (hosting only).
 */
export function planLaunchCapabilities(signals: LaunchPlannerSignals = {}): LaunchPlannerResult {
  const declared = collectDeclaredCapabilities(signals.authConfig, signals.payload)
  const corpus = buildLaunchScanCorpus(signals)
  const intent = typeof signals.intent === 'string' ? signals.intent : undefined

  const reasons: Record<string, string> = {}
  const ordered: LaunchCapabilityId[] = []
  const seen = new Set<string>()

  const add = (id: LaunchCapabilityId, reason: string) => {
    if (seen.has(id)) return
    seen.add(id)
    ordered.push(id)
    reasons[id] = reason
  }

  for (const id of declared) {
    add(id, CUSTOMER_REASONS[id])
  }

  for (const id of LAUNCH_CAPABILITY_IDS) {
    if (seen.has(id)) continue
    if (matchCapability(id, intent, corpus)) {
      add(id, CUSTOMER_REASONS[id])
    }
  }

  return {
    requiredCapabilities: ordered,
    reasons,
    readinessNotes: buildReadinessNotes({
      caps: ordered,
      provisionState: signals.provisionState,
    }),
  }
}
