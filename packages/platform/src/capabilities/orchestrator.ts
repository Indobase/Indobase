/**
 * Capability Orchestrator — ADR 0006.
 * OS/agent call ensure() only; provider adapters stay hidden.
 */

import type { CapabilityId } from '../contracts/runtime'

/** Customer-facing status after ensure / enable. */
export type CapabilityEnableStatus = 'enabled' | 'enabling' | 'failed' | 'unsupported'

export type CapabilityEnsureRequest = {
  /** Business / workspace ref */
  businessRef: string
  /** Customer phrase, alias, or ABI id (e.g. "login", "auth", "Customer Login") */
  capability: string
}

/**
 * Result shaped for chat / OS chrome — never includes provider names.
 */
export type CapabilityEnsureResult = {
  ok: boolean
  /** Canonical ABI id */
  capabilityId: CapabilityId
  /** Indobase-native label (Customer Login, Business Data, …) */
  customerLabel: string
  status: CapabilityEnableStatus
  /** Operator-facing sentence (“Login enabled”, …) */
  message: string
  /** Substrate provision hint — not shown as product UI */
  provisionState?: string
  /** Product handoff URL when setup still needs operator steps (payments/email) */
  launchUrl?: string | null
  /** pending = backend ready, product setup unfinished; ready = fully live */
  setupStatus?: 'pending' | 'ready'
}

/**
 * Hidden provider adapter. Implementations may use any engine;
 * they must not leak vendor names into CapabilityEnsureResult.message.
 * Preferred public name: CapabilityAdapter (ADR 0008).
 */
export type CapabilityProviderAdapter = {
  ensure(input: {
    businessRef: string
    capabilityId: CapabilityId
  }): Promise<{
    ok: boolean
    /**
     * ready → enabled; provisioning → enabling; pending_setup → enabling
     * (backend ready, finish product setup); none/failed as named.
     */
    state: 'ready' | 'provisioning' | 'none' | 'failed' | 'pending_setup'
    /** Overrides surface pending/enabled copy when set (must stay provider-free) */
    customerMessage?: string
    /** Product handoff when state is pending_setup */
    launchUrl?: string | null
    setupStatus?: 'pending' | 'ready'
    /** Internal diagnostics only — stripped from customer message */
    detail?: string
  }>
}

type CapabilitySurface = {
  id: CapabilityId
  customerLabel: string
  aliases: readonly string[]
  enabledMessage: string
  enablingMessage: string
  /** Backend ready but product setup unfinished (commerce / email) */
  pendingMessage?: string
}

const SURFACES: readonly CapabilitySurface[] = [
  {
    id: 'auth',
    customerLabel: 'Customer Login',
    aliases: ['auth', 'login', 'customer login', 'user login', 'sign-in', 'signin'],
    enabledMessage: 'Login enabled',
    enablingMessage: 'Enabling login…',
  },
  {
    id: 'businessData',
    customerLabel: 'Business Data',
    aliases: [
      'businessdata',
      'business data',
      'database',
      'db',
      'customer database',
      'customer data',
    ],
    enabledMessage: 'Customer database created',
    enablingMessage: 'Creating customer database…',
  },
  {
    id: 'storage',
    customerLabel: 'File Storage',
    aliases: ['storage', 'file storage', 'files', 'uploads'],
    enabledMessage: 'File storage enabled',
    enablingMessage: 'Enabling file storage…',
  },
  {
    id: 'commerce',
    customerLabel: 'Payments',
    aliases: ['commerce', 'payments', 'payment', 'checkout', 'billing'],
    enabledMessage: 'Payments are live',
    enablingMessage: 'Enabling payments…',
    pendingMessage:
      'Payments backend is ready — finish checkout setup to charge customers.',
  },
  {
    id: 'events',
    customerLabel: 'Analytics',
    aliases: ['events', 'analytics', 'tracking'],
    enabledMessage: 'Analytics enabled',
    enablingMessage: 'Enabling analytics…',
  },
  {
    id: 'email',
    customerLabel: 'Email',
    aliases: ['email', 'mail'],
    enabledMessage: 'Email enabled',
    enablingMessage: 'Enabling email…',
    pendingMessage: 'Email backend is ready — finish sender setup to send campaigns.',
  },
  {
    id: 'functions',
    customerLabel: 'Automations',
    aliases: ['functions', 'automations', 'edge functions'],
    enabledMessage: 'Automations enabled',
    enablingMessage: 'Enabling automations…',
  },
  {
    id: 'catalog',
    customerLabel: 'Business Catalog',
    aliases: ['catalog'],
    enabledMessage: 'Business catalog enabled',
    enablingMessage: 'Enabling business catalog…',
  },
]

const FORBIDDEN_PROVIDER_PATTERN = new RegExp(
  [
    String.raw`\b(neon|coolify|stripe|razorpay|postgres(ql)?|`,
    'supa' + 'base',
    String.raw`|docker|kubernetes|k8s|clerk|auth0|vercel|netlify|minio|s3)\b`,
  ].join(''),
  'i',
)

export function assertNoProviderLeak(text: string): string {
  if (FORBIDDEN_PROVIDER_PATTERN.test(text)) {
    return 'Something went wrong enabling this capability. Try again or contact support.'
  }
  return text
}

export function resolveCapabilitySurface(raw: string): CapabilitySurface | null {
  let key = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (!key) return null
  key = key.replace(/^(add|enable|create|start|set up|setup)\s+/, '').trim()
  key = key.replace(/^(a|an|the)\s+/, '').trim()
  key = key.replace(/\s+to my business$/, '').trim()
  key = key.replace(/\s+for my business$/, '').trim()
  for (const surface of SURFACES) {
    if (surface.id.toLowerCase() === key.replace(/\s/g, '')) return surface
    if (surface.customerLabel.toLowerCase() === key) return surface
    if (surface.aliases.some((a) => a === key || a.replace(/\s/g, '') === key.replace(/\s/g, ''))) {
      return surface
    }
  }
  return null
}

/** Normalize any user/agent phrase to ABI capability id. */
export function normalizeCapabilityId(raw: string): CapabilityId | null {
  return resolveCapabilitySurface(raw)?.id ?? null
}

export function customerLabelFor(capabilityId: CapabilityId | string): string {
  const surface = resolveCapabilitySurface(String(capabilityId))
  return surface?.customerLabel ?? 'Capability'
}

export function enabledMessageFor(capabilityId: CapabilityId | string): string {
  const surface = resolveCapabilitySurface(String(capabilityId))
  return surface?.enabledMessage ?? 'Capability enabled'
}

export function enablingMessageFor(capabilityId: CapabilityId | string): string {
  const surface = resolveCapabilitySurface(String(capabilityId))
  return surface?.enablingMessage ?? 'Enabling…'
}

/** Pending-setup copy when backend is ready but product setup is unfinished. */
export function pendingMessageFor(capabilityId: CapabilityId | string): string | undefined {
  return resolveCapabilitySurface(String(capabilityId))?.pendingMessage
}

export type CapabilityOrchestrator = {
  ensure(input: CapabilityEnsureRequest): Promise<CapabilityEnsureResult>
  listSurfaces(): readonly { id: CapabilityId; customerLabel: string }[]
}

/**
 * Create the Orchestrator. Pass a CapabilityProviderAdapter that talks to
 * whatever engine you choose — never expose that choice in results.
 */
export function createCapabilityOrchestrator(
  adapter: CapabilityProviderAdapter,
): CapabilityOrchestrator {
  return {
    listSurfaces() {
      return SURFACES.map(({ id, customerLabel }) => ({ id, customerLabel }))
    },

    async ensure(input) {
      const surface = resolveCapabilitySurface(input.capability)
      if (!surface) {
        return {
          ok: false,
          capabilityId: input.capability as CapabilityId,
          customerLabel: 'Capability',
          status: 'unsupported',
          message: assertNoProviderLeak(
            `I can’t enable “${input.capability.trim()}” yet. Try Customer Login, Business Data, Payments, or Launch.`,
          ),
        }
      }

      try {
        const raw = await adapter.ensure({
          businessRef: input.businessRef,
          capabilityId: surface.id,
        })

        if (raw.state === 'provisioning' || (raw.ok && raw.state === 'none')) {
          return {
            ok: true,
            capabilityId: surface.id,
            customerLabel: surface.customerLabel,
            status: 'enabling',
            message: assertNoProviderLeak(surface.enablingMessage),
            provisionState: raw.state,
          }
        }

        if (raw.state === 'pending_setup') {
          const pendingCopy =
            raw.customerMessage?.trim() ||
            surface.pendingMessage ||
            surface.enablingMessage
          return {
            ok: true,
            capabilityId: surface.id,
            customerLabel: surface.customerLabel,
            status: 'enabling',
            message: assertNoProviderLeak(pendingCopy),
            provisionState: 'pending_setup',
            launchUrl: raw.launchUrl ?? null,
            setupStatus: raw.setupStatus ?? 'pending',
          }
        }

        if (!raw.ok || raw.state === 'failed') {
          return {
            ok: false,
            capabilityId: surface.id,
            customerLabel: surface.customerLabel,
            status: 'failed',
            message: assertNoProviderLeak(
              `Couldn’t enable ${surface.customerLabel} right now. Try again in a moment.`,
            ),
            provisionState: raw.state,
          }
        }

        return {
          ok: true,
          capabilityId: surface.id,
          customerLabel: surface.customerLabel,
          status: 'enabled',
          message: assertNoProviderLeak(
            raw.customerMessage?.trim() || surface.enabledMessage,
          ),
          provisionState: raw.state,
          launchUrl: raw.launchUrl,
          setupStatus: raw.setupStatus ?? 'ready',
        }
      } catch {
        return {
          ok: false,
          capabilityId: surface.id,
          customerLabel: surface.customerLabel,
          status: 'failed',
          message: assertNoProviderLeak(
            `Couldn’t enable ${surface.customerLabel} right now. Try again in a moment.`,
          ),
        }
      }
    },
  }
}

/** Map legacy provision_state + ok into Orchestrator customer result (no adapter call). */
export function toCapabilityEnsureResult(input: {
  capability: string
  ok: boolean
  provisionState?: string
  message?: string
}): CapabilityEnsureResult {
  const surface = resolveCapabilitySurface(input.capability)
  const capabilityId = (surface?.id ?? input.capability) as CapabilityId
  const customerLabel = surface?.customerLabel ?? 'Capability'
  const state = (input.provisionState || '').toLowerCase()

  if (!surface) {
    return {
      ok: false,
      capabilityId,
      customerLabel,
      status: 'unsupported',
      message: assertNoProviderLeak(
        input.message
          ? assertNoProviderLeak(input.message)
          : `I can’t enable “${input.capability}” yet.`,
      ),
      provisionState: input.provisionState,
    }
  }

  if (!input.ok) {
    return {
      ok: false,
      capabilityId,
      customerLabel,
      status: 'failed',
      message: assertNoProviderLeak(
        `Couldn’t enable ${customerLabel} right now. Try again in a moment.`,
      ),
      provisionState: input.provisionState,
    }
  }

  if (state === 'provisioning' || state === 'none') {
    return {
      ok: true,
      capabilityId,
      customerLabel,
      status: 'enabling',
      message: assertNoProviderLeak(surface.enablingMessage),
      provisionState: input.provisionState,
    }
  }

  if (state === 'pending_setup') {
    return {
      ok: true,
      capabilityId,
      customerLabel,
      status: 'enabling',
      message: assertNoProviderLeak(
        input.message?.trim() || surface.pendingMessage || surface.enablingMessage,
      ),
      provisionState: input.provisionState,
      setupStatus: 'pending',
    }
  }

  return {
    ok: true,
    capabilityId,
    customerLabel,
    status: 'enabled',
    message: assertNoProviderLeak(surface.enabledMessage),
    provisionState: input.provisionState,
    setupStatus: 'ready',
  }
}
