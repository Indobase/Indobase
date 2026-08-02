/**
 * Indobase Discuss — platform event catalogue (client-safe: no Node crypto / DB imports).
 *
 * This is the contract between the publishers in `discuss-events.ts` and the ActivityCard
 * renderer. `discuss.messages.event_type` is a plain `text` column and `event_data` is
 * unvalidated `jsonb`, so the only thing keeping a card renderable is this file. Both sides
 * import it; neither side redeclares the shape.
 *
 * Terminal outcome is encoded in the event TYPE rather than inside `event_data` so the Activity
 * channel can be filtered with `event_type in (...)` instead of a jsonb predicate, and so the
 * renderer gets an exhaustive switch with no nested branching.
 *
 * Read alongside: indobase-discuss/db/002_discuss_functions.sql (`discuss.publish_event`).
 */

import type { MerchantKycStatus } from './merchant-kyc-types'

/** A deploy of the project's hosted app reached a terminal state. */
export type DiscussDeploymentEventData = {
  deployment_id: string
  target_url: string | null
  /** Where the deploy was triggered from — 'studio' | 'builder' | 'api'. */
  requested_via: string | null
  completed_at: string | null
  /** Only meaningful on `deployment.failed`. */
  error: string | null
}

/** A mobile build (currently Android AAB) reached a terminal state. */
export type DiscussMobileBuildEventData = {
  build_id: string
  /** e.g. 'android_aab'. */
  target: string
  /** 'production' | 'preview'. */
  profile: string
  /** 'expo' | 'react_native' | 'flutter' | 'other'. */
  framework: string
  artifact_count: number
  completed_at: string | null
  /** Only meaningful on `mobile_build.failed`. */
  error: string | null
}

/**
 * Money landed for this project. `amount_minor` is in the currency's minor unit (paise for INR)
 * because that is how the payment providers report it — never render it without dividing.
 */
export type DiscussPaymentReceivedEventData = {
  /** What the payment was for. Extend the union when a second payable lands in Studio. */
  kind: 'domain_registration'
  /** Id of the row in the originating product (e.g. the domain registration). */
  reference_id: string
  /** Human summary for the card headline, e.g. "example.com (1 year)". */
  description: string
  amount_minor: number
  /** ISO-4217, e.g. 'INR'. */
  currency: string
  /** e.g. 'razorpay'. */
  provider: string
  provider_payment_id: string | null
  received_at: string
}

/** Merchant KYC moved between states in Indobase Payments. */
export type DiscussMerchantKycEventData = {
  status: MerchantKycStatus
  previous_status: MerchantKycStatus | null
  /** Rejection reason, or the provider's message, when there is one. */
  reason: string | null
  /** Settlement/onboarding provider that produced the decision. */
  provider: string | null
  changed_at: string
}

/** The whole catalogue: event type → the shape stored in `discuss.messages.event_data`. */
export type DiscussEventDataMap = {
  'deployment.ready': DiscussDeploymentEventData
  'deployment.failed': DiscussDeploymentEventData
  'mobile_build.ready': DiscussMobileBuildEventData
  'mobile_build.failed': DiscussMobileBuildEventData
  'payment.received': DiscussPaymentReceivedEventData
  'merchant_kyc.changed': DiscussMerchantKycEventData
}

export type DiscussEventType = keyof DiscussEventDataMap

/** Discriminated union for the renderer: `switch (event.type)` narrows `event.data`. */
export type DiscussEvent = {
  [K in DiscussEventType]: { type: K; data: DiscussEventDataMap[K] }
}[DiscussEventType]

export type DiscussEventTone = 'positive' | 'negative' | 'neutral'

export type DiscussEventDescriptor = {
  /** Card headline. Deliberately plain — the card supplies the detail from `event_data`. */
  label: string
  tone: DiscussEventTone
}

export const DISCUSS_EVENT_CATALOGUE: Record<DiscussEventType, DiscussEventDescriptor> = {
  'deployment.ready': { label: 'Deployment live', tone: 'positive' },
  'deployment.failed': { label: 'Deployment failed', tone: 'negative' },
  'mobile_build.ready': { label: 'Mobile build ready', tone: 'positive' },
  'mobile_build.failed': { label: 'Mobile build failed', tone: 'negative' },
  'payment.received': { label: 'Payment received', tone: 'positive' },
  'merchant_kyc.changed': { label: 'Merchant KYC updated', tone: 'neutral' },
}

export const DISCUSS_EVENT_TYPES = Object.keys(DISCUSS_EVENT_CATALOGUE) as DiscussEventType[]

export function isDiscussEventType(value: unknown): value is DiscussEventType {
  return typeof value === 'string' && value in DISCUSS_EVENT_CATALOGUE
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

const MERCHANT_KYC_STATUSES = new Set<string>([
  'draft',
  'submitted',
  'under_review',
  'verified',
  'rejected',
])

function asMerchantKycStatus(value: unknown): MerchantKycStatus | null {
  const raw = asString(value)
  return raw && MERCHANT_KYC_STATUSES.has(raw) ? (raw as MerchantKycStatus) : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

/**
 * Narrows a row read out of `discuss.messages` into a renderable event.
 *
 * Returns null for unknown event types and for rows whose `event_data` is missing the fields the
 * card needs. Callers should skip those rows rather than crash the channel: `event_data` is
 * jsonb written by whichever Studio version was deployed when the event happened, so an older or
 * newer shape is a normal thing to encounter, not a bug.
 */
export function parseDiscussEvent(
  eventType: unknown,
  eventData: unknown
): DiscussEvent | null {
  if (!isDiscussEventType(eventType)) return null
  const data = asRecord(eventData)
  if (!data) return null

  switch (eventType) {
    case 'deployment.ready':
    case 'deployment.failed': {
      const deploymentId = asString(data.deployment_id)
      if (!deploymentId) return null
      return {
        type: eventType,
        data: {
          deployment_id: deploymentId,
          target_url: asString(data.target_url),
          requested_via: asString(data.requested_via),
          completed_at: asString(data.completed_at),
          error: asString(data.error),
        },
      }
    }
    case 'mobile_build.ready':
    case 'mobile_build.failed': {
      const buildId = asString(data.build_id)
      if (!buildId) return null
      return {
        type: eventType,
        data: {
          build_id: buildId,
          target: asString(data.target) ?? 'android_aab',
          profile: asString(data.profile) ?? 'production',
          framework: asString(data.framework) ?? 'other',
          artifact_count: asNumber(data.artifact_count) ?? 0,
          completed_at: asString(data.completed_at),
          error: asString(data.error),
        },
      }
    }
    case 'payment.received': {
      const referenceId = asString(data.reference_id)
      const amountMinor = asNumber(data.amount_minor)
      if (!referenceId || amountMinor === null) return null
      return {
        type: eventType,
        data: {
          kind: 'domain_registration',
          reference_id: referenceId,
          description: asString(data.description) ?? referenceId,
          amount_minor: amountMinor,
          currency: asString(data.currency) ?? 'INR',
          provider: asString(data.provider) ?? 'unknown',
          provider_payment_id: asString(data.provider_payment_id),
          received_at: asString(data.received_at) ?? '',
        },
      }
    }
    case 'merchant_kyc.changed': {
      const status = asMerchantKycStatus(data.status)
      if (!status) return null
      return {
        type: eventType,
        data: {
          status,
          previous_status: asMerchantKycStatus(data.previous_status),
          reason: asString(data.reason),
          provider: asString(data.provider),
          changed_at: asString(data.changed_at) ?? '',
        },
      }
    }
  }

  // Unreachable: the switch is exhaustive over DiscussEventType. Present so a future event type
  // added to the catalogue but not to the switch degrades to "unrenderable" instead of undefined.
  return null
}
