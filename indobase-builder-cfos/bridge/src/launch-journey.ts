/**
 * Zero → One launch ladder (Naive-style): visible progress + next action for operators.
 */
import type { Session } from './auth.js'
import { isGuestSession } from './auth.js'
import { getBusinessSpec } from './ux/business-spec.js'
import {
  appTypeToKind,
  businessJourneyStageLabel,
  uxContextualActions,
  uxHeadline,
  type BusinessAppKind,
  type UxJourneyFlags,
} from './ux-conductor.js'

export type LaunchJourneyStageId =
  | 'account'
  | 'preview'
  | 'backend'
  | 'live'
  | 'payments'
  | 'production'

export type LaunchJourneyStage = {
  id: LaunchJourneyStageId
  label: string
  status: 'done' | 'current' | 'upcoming'
}

export type LaunchJourneyNextAction = {
  label: string
  message: string
}

export type LaunchJourneyState = {
  guest: boolean
  live_url: string | null
  backend_ready: boolean
  payments_ready: boolean
  current_stage: LaunchJourneyStageId
  /** Per-stage done | current | upcoming — primary UI model */
  stages: LaunchJourneyStage[]
  /** Spec alias: stage ids marked complete */
  completed_stages: LaunchJourneyStageId[]
  /** Spec alias: diagnostic flags for session + launch registry */
  flags: LaunchJourneyFlags
  next_action: LaunchJourneyNextAction | null
  /** Human headline for LaunchJourneyCard */
  headline: string
}

export type LaunchJourneyFlags = {
  is_guest: boolean
  is_backend_ready: boolean
  is_live: boolean
  is_payments_ready: boolean
  is_production_ready: boolean
  app_kind?: BusinessAppKind
}

export type LaunchStatusSnapshot = {
  subdomain?: string
  customDomain?: string
  url?: string
  previewUrl?: string | null
  /** Artifact exists and is the session preview — not a guessed path. */
  previewReady?: boolean
  /** This project's catalog/commerce is provisioned — not merely managed PocketBase attached. */
  catalogReady?: boolean
}

function sessionLooksPaymentsReady(session: Session): boolean {
  const env = session.backend?.public_env
  if (!env || typeof env !== 'object') return false
  const blob = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
    .toLowerCase()
  return /razorpay|stripe|gateway_keys|payments_ready|checkout_ready/.test(blob)
}

export function buildLaunchJourneyState(
  session: Session,
  launch?: LaunchStatusSnapshot | null,
  appKind?: BusinessAppKind | null,
): LaunchJourneyState {
  const guest = isGuestSession(session)
  const catalogReady = Boolean(launch?.catalogReady)
  const paymentsReady = sessionLooksPaymentsReady(session)
  const published = Boolean(launch?.subdomain || launch?.customDomain)
  const liveUrl =
    (published && launch?.url) ||
    (published && launch?.subdomain
      ? `https://${launch.subdomain}.sites.indobase.in`
      : null) ||
    (published && launch?.customDomain ? `https://${launch.customDomain}` : null)

  const accountDone = !guest
  const backendDone = catalogReady
  const liveDone = published
  const previewDone = Boolean(launch?.previewReady) || liveDone
  const paymentsDone = paymentsReady

  const productionDone = liveDone && backendDone && paymentsDone

  let currentStage: LaunchJourneyStageId = 'account'
  if (guest) currentStage = 'account'
  else if (!previewDone && !liveDone) currentStage = 'preview'
  else if (previewDone && !liveDone) currentStage = 'live'
  else if (liveDone && !backendDone) currentStage = 'backend'
  else if (liveDone && backendDone && !paymentsDone) currentStage = 'payments'
  else if (productionDone) currentStage = 'production'
  else currentStage = 'preview'

  const specKind = appTypeToKind(getBusinessSpec(session.projectRef)?.businessType)
  const kind = appKind || specKind
  const stages: LaunchJourneyStage[] = [
    stage('account', businessJourneyStageLabel('account', kind), accountDone, currentStage === 'account'),
    stage('preview', businessJourneyStageLabel('preview', kind), previewDone, currentStage === 'preview'),
    stage('backend', businessJourneyStageLabel('backend', kind), backendDone, currentStage === 'backend'),
    stage('live', businessJourneyStageLabel('live', kind), liveDone, currentStage === 'live'),
    stage('payments', businessJourneyStageLabel('payments', kind), paymentsDone, currentStage === 'payments'),
    stage('production', businessJourneyStageLabel('production', kind), productionDone, currentStage === 'production'),
  ]

  const flagsForUx: UxJourneyFlags = {
    guest,
    live: liveDone,
    backendReady: backendDone,
    paymentsReady: paymentsDone,
    previewReady: previewDone,
    liveUrl,
    appKind: kind,
  }
  const actions = uxContextualActions(flagsForUx)
  const next_action = actions[0] || null
  const headline = uxHeadline(flagsForUx)

  const flags: LaunchJourneyFlags = {
    is_guest: guest,
    is_backend_ready: backendDone,
    is_live: liveDone,
    is_payments_ready: paymentsDone,
    is_production_ready: productionDone,
    app_kind: kind,
  }

  const completed_stages = stages.filter((s) => s.status === 'done').map((s) => s.id)

  return {
    guest,
    live_url: liveUrl,
    backend_ready: backendDone,
    payments_ready: paymentsReady,
    current_stage: currentStage,
    stages,
    completed_stages,
    flags,
    next_action,
    headline,
  }
}

function stage(
  id: LaunchJourneyStageId,
  label: string,
  done: boolean,
  current: boolean,
): LaunchJourneyStage {
  return {
    id,
    label,
    status: done ? 'done' : current ? 'current' : 'upcoming',
  }
}
