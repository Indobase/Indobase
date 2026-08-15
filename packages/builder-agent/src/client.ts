/**
 * Thin HTTP client for Builder CFOS agent tools.
 * Use from automation, tests, or agent runtimes that already hold a session cookie
 * or agent principal headers — not from published storefronts.
 */

export type BuilderAgentClientOptions = {
  /** e.g. https://builder.indobase.in */
  baseUrl: string
  /** Browser session cookie value, if any. */
  sessionCookie?: string
  /** CFOS agent username (ib_…). */
  agentUsername?: string
  fetch?: typeof fetch
}

export type JsonRecord = Record<string, unknown>

function joinUrl(base: string, path: string): string {
  const root = base.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${root}${suffix}`
}

export class BuilderAgentClient {
  private readonly baseUrl: string
  private readonly sessionCookie?: string
  private readonly agentUsername?: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: BuilderAgentClientOptions) {
    this.baseUrl = opts.baseUrl
    this.sessionCookie = opts.sessionCookie
    this.agentUsername = opts.agentUsername
    this.fetchImpl = opts.fetch || fetch
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(extra || {}),
    }
    if (this.sessionCookie) headers.Cookie = this.sessionCookie.includes('=')
      ? this.sessionCookie
      : `indobase_builder_cfos_session=${this.sessionCookie}`
    if (this.agentUsername) headers['X-Indobase-Agent-Username'] = this.agentUsername
    return headers
  }

  async getSession(): Promise<JsonRecord> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, '/api/session'), {
      method: 'GET',
      headers: this.headers(),
      credentials: 'include',
    })
    return (await res.json().catch(() => ({}))) as JsonRecord
  }

  async launchProductionApp(body: JsonRecord): Promise<JsonRecord> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, '/api/os/tools/launchProductionApp'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      credentials: 'include',
    })
    return (await res.json().catch(() => ({}))) as JsonRecord
  }

  async launchBusiness(body: JsonRecord): Promise<JsonRecord> {
    const res = await this.fetchImpl(joinUrl(this.baseUrl, '/api/os/tools/launchBusiness'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      credentials: 'include',
    })
    return (await res.json().catch(() => ({}))) as JsonRecord
  }

  /** Read generate skills hint the session would inject for this app type. */
  async generateSkillsFromSession(): Promise<string | null> {
    const session = await this.getSession()
    const generate = (session.launch as JsonRecord | undefined)?.generate as JsonRecord | undefined
    const skills = generate?.skills
    return typeof skills === 'string' ? skills : null
  }
}

export function createBuilderAgentClient(opts: BuilderAgentClientOptions): BuilderAgentClient {
  return new BuilderAgentClient(opts)
}
