/**
 * Tell the business owner a visitor left an enquiry.
 * Email is best-effort — a missing Resend key or unknown owner must never
 * fail the visitor's submission.
 */
import { lookupMemberPrincipalForProject } from '../agent-principal-store.js'
import { getBusinessSpec } from '../ux/business-spec.js'
import { workspaceLeadsInboxUrl } from '../ux/presentation.js'
import type { NormalizedLead } from './service.js'

export type LeadNotifyInput = {
  projectRef: string
  lead: NormalizedLead
  /** Injected in tests. */
  lookupOwner?: (projectRef: string) => Promise<{ email: string } | null>
  send?: (message: LeadNotifyMessage) => Promise<boolean>
}

export type LeadNotifyMessage = {
  to: string
  subject: string
  text: string
}

export type LeadNotifyResult =
  | { sent: true; to: string }
  | { sent: false; reason: 'no_owner' | 'no_mailer' | 'send_failed' }

function bridgePublicOrigin(): string {
  return (
    process.env.INDOBASE_BRIDGE_PUBLIC_URL?.trim() ||
    process.env.BRIDGE_PUBLIC_URL?.trim() ||
    'https://builder.indobase.in'
  ).replace(/\/+$/, '')
}

function brandFor(projectRef: string): string {
  const spec = getBusinessSpec(projectRef)
  const name = spec?.businessName?.trim()
  return name && name.length > 1 ? name : 'Your website'
}

function contactLine(lead: NormalizedLead): string {
  return [lead.email, lead.phone].filter(Boolean).join(' · ') || 'no contact left'
}

export function composeLeadNotifyMessage(input: {
  brand: string
  lead: NormalizedLead
  inboxUrl: string
}): LeadNotifyMessage {
  const snippet = (input.lead.message || '').trim()
  const body = snippet
    ? snippet.length > 280
      ? `${snippet.slice(0, 279)}…`
      : snippet
    : '(no message)'
  return {
    to: '',
    subject: `New enquiry for ${input.brand}`,
    text: [
      `${input.lead.name} wrote in on ${input.brand}.`,
      '',
      `Reply to: ${contactLine(input.lead)}`,
      '',
      body,
      '',
      `Open your inbox: ${input.inboxUrl}`,
    ].join('\n'),
  }
}

async function sendViaResend(message: LeadNotifyMessage): Promise<boolean> {
  const apiKey =
    process.env.RESEND_API_KEY?.trim() ||
    (process.env.POCKETBASE_SMTP_PASS?.trim()?.startsWith('re_')
      ? process.env.POCKETBASE_SMTP_PASS.trim()
      : '')
  if (!apiKey) return false
  const from =
    process.env.POCKETBASE_SMTP_SENDER?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    'Indobase <hello@indobase.in>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  }).catch(() => null)
  return Boolean(res?.ok)
}

/** Fire after a successful lead write. Never throws. */
export async function notifyOwnerOfLead(input: LeadNotifyInput): Promise<LeadNotifyResult> {
  try {
    const lookup = input.lookupOwner || lookupMemberPrincipalForProject
    const owner = await lookup(input.projectRef)
    const to = owner?.email?.trim() || ''
    if (!to.includes('@')) return { sent: false, reason: 'no_owner' }

    const message = composeLeadNotifyMessage({
      brand: brandFor(input.projectRef),
      lead: input.lead,
      inboxUrl: workspaceLeadsInboxUrl(bridgePublicOrigin()),
    })
    message.to = to

    const send = input.send || sendViaResend
    if (send === sendViaResend) {
      const apiKey =
        process.env.RESEND_API_KEY?.trim() ||
        (process.env.POCKETBASE_SMTP_PASS?.trim()?.startsWith('re_')
          ? process.env.POCKETBASE_SMTP_PASS.trim()
          : '')
      if (!apiKey) return { sent: false, reason: 'no_mailer' }
    }

    const ok = await send(message)
    return ok ? { sent: true, to } : { sent: false, reason: 'send_failed' }
  } catch {
    return { sent: false, reason: 'send_failed' }
  }
}
