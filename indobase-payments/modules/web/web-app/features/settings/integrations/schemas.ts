import { z } from 'zod'

export const stripeIntegrationSchema = z.object({
  alias: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens allowed'),
  apiPublishableKey: z
    .string()
    .min(1, 'Publishable key is required')
    .regex(/^pk_/, 'Should start with pk_'),
  apiSecretKey: z.string().min(1, 'Secret key is required').regex(/^sk_/, 'Should start with sk_'),
  webhookSecret: z
    .string()
    .min(1, 'Webhook secret is required')
    .regex(/^whsec_/, 'Should start with whsec_'),
})

/** Machine credentials for India settlements (Razorpay Recurring / Route). */
export const indiaSettlementsSchema = z.object({
  alias: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens allowed'),
  keyId: z
    .string()
    .min(1, 'Key Id is required')
    .regex(/^rzp_/, 'Should start with rzp_'),
  keySecret: z.string().min(1, 'Key Secret is required'),
  webhookSecret: z.string().min(1, 'Webhook secret is required'),
})

export const hubspotIntegrationSchema = z.object({
  autoSync: z.boolean().default(true),
})
