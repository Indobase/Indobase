/**
 * Zero → One launch ladder (Naive-style): visible progress + next action for operators.
 */
import type { Session } from './auth.js'
import { isGuestSession } from './auth.js'

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
}

export type LaunchStatusSnapshot = {
  subdomain?: string
  customDomain?: string
  url?: string
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
): LaunchJourneyState {
  const guest = isGuestSession(session)
  const backendReady = Boolean(session.backend?.api_url || session.backend?.rest_url)
  const paymentsReady = sessionLooksPaymentsReady(session)
  const published = Boolean(launch?.subdomain || launch?.customDomain)
  const liveUrl =
    (published && launch?.url) ||
    (published && launch?.subdomain
      ? `https://${launch.subdomain}.sites.indobase.in`
      : null) ||
    (published && launch?.customDomain ? `https://${launch.customDomain}` : null)

  const accountDone = !guest
  const backendDone = backendReady
  const liveDone = published
  // Preview is not "signed in" — require backend or a published site.
  const previewDone = liveDone || backendDone
  const paymentsDone = paymentsReady

  const productionDone = liveDone && backendDone && paymentsDone

  let currentStage: LaunchJourneyStageId = 'account'
  if (!guest && !liveDone) currentStage = 'live'
  else if (liveDone && !backendDone) currentStage = 'backend'
  else if (liveDone && backendDone && !paymentsDone) currentStage = 'payments'
  else if (productionDone) currentStage = 'production'
  else if (!guest) currentStage = 'live'

  const stages: LaunchJourneyStage[] = [
    stage('account', 'Account', accountDone, currentStage === 'account'),
    stage('preview', 'Preview', previewDone, false),
    stage('backend', 'Backend', backendDone, currentStage === 'backend'),
    stage('live', 'Go Live', liveDone, currentStage === 'live'),
    stage('payments', 'Payments', paymentsDone, currentStage === 'payments'),
    stage('production', 'Production', productionDone, currentStage === 'production'),
  ]

  const next_action = guest
    ? {
        label: 'Create account to launch',
        message:
          'Create my Indobase account in chat (name + email + DPDP consent), verify OTP, then continue building my business site toward Go Live.',
      }
    : !liveDone
      ? {
          label: 'Go Live on Indobase',
          message:
            'Go Live — publish this business with launchBusiness using the real html/files, quote the exact live url, then emit Domain / Add payments / Production checklist chips.',
        }
      : !backendDone
        ? {
            label: 'Add a real backend',
            message:
              'Add a real product backend — call guidedBackend, publish storefront_html (window.indobase.commerce), prove inventory if ecommerce, then continue toward payments and production checklist.',
          }
        : !paymentsDone
          ? {
              // Payments stage CTA must match stepper/headline — domain is a secondary chip.
              label: 'Add payments',
              message:
                'Add payments — ask me India (Razorpay) vs International (Stripe), enable payments, guide KYC, connectGateway with my keys, then wireCheckout for Buy CTAs. Domain can wait until checkout works.',
            }
          : {
              label: 'Run production checklist',
              message:
                'Run productionChecklist with the live_url and honest checks — only claim production ready if claim_production_ready is true.',
            }

  const headline = guest
    ? 'Sign in to publish your site on Indobase'
    : liveDone && !backendDone
      ? 'Your site is live — add a real backend'
      : liveDone
        ? paymentsDone
          ? 'Your business is live — finish production checklist'
          : 'Your site is live — add payments to start selling'
        : backendDone
          ? 'Backend ready — publish to your Indobase subdomain'
          : 'Preview ready — go live when you are'

  const flags: LaunchJourneyFlags = {
    is_guest: guest,
    is_backend_ready: backendDone,
    is_live: liveDone,
    is_payments_ready: paymentsDone,
    is_production_ready: productionDone,
  }

  const completed_stages = stages.filter((s) => s.status === 'done').map((s) => s.id)

  return {
    guest,
    live_url: liveUrl,
    backend_ready: backendReady,
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
