import type { CapabilityId, ProjectRuntime } from '../contracts/runtime'

/**
 * Compact, prompt-safe snapshot of resolved capabilities for agents / codegen.
 * Derived from ProjectRuntime ABI — never invents product hosts as source of truth.
 */

export type GenerationCapabilitySummary = {
  id: CapabilityId
  enabled: boolean
  intents: readonly string[]
  permissions: readonly string[]
  sdk?: {
    package: string
    importHint: string
  }
  /** Env binding keys present (values included only when data-plane shaped). */
  env?: Record<string, string>
  /** Endpoint keys → data-plane-relative paths or tenant URLs from bindings. */
  endpoints?: Record<string, string>
}

export type GenerationCapabilityContext = {
  schemaVersion: 1
  projectRef: string
  /** Enabled (and any explicitly resolved) capabilities. */
  capabilities: GenerationCapabilitySummary[]
}

/** Product marketing hosts must not be treated as capability SoT in prompts. */
const PRODUCT_HOST_RE =
  /\b(?:studio|builder|payments|analytics|crm|email|social|design|video|discuss|meet|calendar|workspace|suite|domains)\.indobase\.(?:in|fun)\b/i

function scrubProductHosts(value: string): string | undefined {
  if (PRODUCT_HOST_RE.test(value)) {
    return undefined
  }
  return value
}

function scrubRecord(record: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!record) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) {
    const scrubbed = scrubProductHosts(v)
    if (scrubbed !== undefined) {
      out[k] = scrubbed
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Build a generation/agent capability context from a resolved ProjectRuntime.
 * Prefer this over ad-hoc product knowledge in prompts.
 */
export function buildGenerationCapabilityContext(
  runtime: ProjectRuntime,
): GenerationCapabilityContext {
  const capabilities: GenerationCapabilitySummary[] = []

  for (const [id, descriptor] of Object.entries(runtime.capabilities)) {
    if (!descriptor) continue
    const summary: GenerationCapabilitySummary = {
      id,
      enabled: descriptor.enabled,
      intents: descriptor.intents,
      permissions: descriptor.permissions,
    }
    if (descriptor.bindings.sdk) {
      summary.sdk = {
        package: descriptor.bindings.sdk.package,
        importHint: descriptor.bindings.sdk.importHint,
      }
    }
    const env = scrubRecord(descriptor.bindings.env)
    if (env) summary.env = env
    const endpoints = scrubRecord(descriptor.bindings.endpoints)
    if (endpoints) summary.endpoints = endpoints
    capabilities.push(summary)
  }

  capabilities.sort((a, b) => String(a.id).localeCompare(String(b.id)))

  return {
    schemaVersion: 1,
    projectRef: runtime.projectRef,
    capabilities,
  }
}

/** XML appendix for LLM system prompts — capability gateway surface. */
export function formatGenerationCapabilityContextPrompt(
  context: GenerationCapabilityContext,
): string {
  if (context.capabilities.length === 0) {
    return `
<indobase_project_capabilities>
  projectRef: ${context.projectRef}
  No capabilities resolved yet. Do not invent product hosts or billing status.
  Prefer Indobase data-plane + @indobaseinc SDKs only when the user asks for backend features.
</indobase_project_capabilities>`
  }

  const lines = context.capabilities.map((cap) => {
    const parts = [
      `- ${cap.id}: enabled=${cap.enabled}`,
      `  intents: ${cap.intents.join(', ') || '(none)'}`,
      `  permissions: ${cap.permissions.join(', ') || '(none)'}`,
    ]
    if (cap.sdk) {
      parts.push(`  sdk: ${cap.sdk.package} (${cap.sdk.importHint})`)
    }
    if (cap.env) {
      parts.push(`  env: ${Object.keys(cap.env).join(', ')}`)
    }
    if (cap.endpoints) {
      parts.push(`  endpoints: ${Object.keys(cap.endpoints).join(', ')}`)
    }
    return parts.join('\n')
  })

  return `
<indobase_project_capabilities>
  Source: Platform Capability Resolver (Project Runtime ABI). Treat this as the gateway for what the project can assume — not Studio/product URLs.
  projectRef: ${context.projectRef}
  Commerce is capability id \`commerce\` (product UI may say Indobase Payments).
${lines.join('\n')}
</indobase_project_capabilities>`
}
