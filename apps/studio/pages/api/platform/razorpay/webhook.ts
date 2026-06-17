import type { NextApiRequest, NextApiResponse } from 'next'

import {
  handleRazorpayWebhookEvent,
  verifyRazorpayWebhookSignature,
} from 'lib/api/saas/razorpay-billing'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }

  const signature = req.headers['x-razorpay-signature']
  const signatureValue = typeof signature === 'string' ? signature : signature?.[0]

  let rawBody: string
  try {
    rawBody = await readRawBody(req)
  } catch {
    return res.status(400).json({ message: 'Invalid request body' })
  }

  if (!verifyRazorpayWebhookSignature(rawBody, signatureValue)) {
    return res.status(401).json({ message: 'Invalid webhook signature' })
  }

  let event: Parameters<typeof handleRazorpayWebhookEvent>[0]
  try {
    event = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ message: 'Invalid JSON' })
  }

  try {
    await handleRazorpayWebhookEvent(event, {
      eventId: typeof req.headers['x-razorpay-event-id'] === 'string'
        ? req.headers['x-razorpay-event-id']
        : Array.isArray(req.headers['x-razorpay-event-id'])
          ? req.headers['x-razorpay-event-id'][0]
          : undefined,
    })
    return res.status(200).json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook handler failed'
    console.error('[razorpay/webhook]', message)
    return res.status(500).json({ message })
  }
}
