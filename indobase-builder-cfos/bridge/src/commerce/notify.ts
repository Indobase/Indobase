/**
 * Tell the store owner a customer placed an order.
 * Best-effort — missing Resend or unknown owner must never fail checkout.
 */
import { lookupMemberPrincipalForProject } from '../agent-principal-store.js'
import { getBusinessSpec } from '../ux/business-spec.js'
import { workspaceOrdersInboxUrl } from '../ux/presentation.js'
import { minorToMajor } from './money.js'

export type OrderNotifyLine = {
  name: string
  quantity: number
}

export type OrderNotifyInput = {
  projectRef: string
  orderId: string
  customerName?: string
  customerEmail: string
  amountMinor: number
  currency: string
  lines: OrderNotifyLine[]
  lookupOwner?: (projectRef: string) => Promise<{ email: string } | null>
  send?: (message: OrderNotifyMessage) => Promise<boolean>
}

export type OrderNotifyMessage = {
  to: string
  subject: string
  text: string
}

export type OrderNotifyResult =
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
  return name && name.length > 1 ? name : 'Your store'
}

function moneyLabel(amountMinor: number, currency: string): string {
  const major = minorToMajor(amountMinor, currency)
  const code = (currency || 'INR').toUpperCase()
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: code }).format(major)
  } catch {
    return `${code} ${major}`
  }
}

export function composeOrderNotifyMessage(input: {
  brand: string
  orderId: string
  customerName?: string
  customerEmail: string
  amountMinor: number
  currency: string
  lines: OrderNotifyLine[]
  inboxUrl: string
}): OrderNotifyMessage {
  const who = (input.customerName || '').trim() || input.customerEmail
  const items = input.lines
    .slice(0, 8)
    .map((line) => `• ${line.quantity}× ${line.name}`)
    .join('\n')
  const more =
    input.lines.length > 8 ? `\n• …and ${input.lines.length - 8} more` : ''
  const ref = input.orderId.replace(/^ord_/i, '').slice(0, 12)
  return {
    to: '',
    subject: `New order for ${input.brand}`,
    text: [
      `${who} placed an order on ${input.brand}.`,
      '',
      `Total: ${moneyLabel(input.amountMinor, input.currency)}`,
      `Reference: ${ref || input.orderId}`,
      `Customer: ${input.customerEmail}`,
      '',
      items || '• (items on the order)',
      more,
      '',
      `Open orders: ${input.inboxUrl}`,
    ]
      .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n')
      .trim(),
  }
}

async function sendViaResend(message: OrderNotifyMessage): Promise<boolean> {
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

/** Fire after a successful checkout write. Never throws. */
export async function notifyOwnerOfOrder(input: OrderNotifyInput): Promise<OrderNotifyResult> {
  try {
    const lookup = input.lookupOwner || lookupMemberPrincipalForProject
    const owner = await lookup(input.projectRef)
    const to = owner?.email?.trim() || ''
    if (!to.includes('@')) return { sent: false, reason: 'no_owner' }

    const message = composeOrderNotifyMessage({
      brand: brandFor(input.projectRef),
      orderId: input.orderId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      amountMinor: input.amountMinor,
      currency: input.currency,
      lines: input.lines,
      inboxUrl: workspaceOrdersInboxUrl(bridgePublicOrigin()),
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
